import fs from 'fs';
import path from 'path';

import ExcelJS from 'exceljs';

import config from '../../config.js';
import { CANTON_FAIR_URL, STANDARD_TIMEOUT, PATHS } from '../constants.js';
import { appendToJSONArrFile } from '../utils.js';

export function shouldSkipProductScraping() {
	const productCategoriesToScrape = getProductCategoriesToScrape({ logInfo: false });
	const skipProductScraping = productCategoriesToScrape.length === 0;
	if (skipProductScraping) {
		console.log('\n***\n');
		console.log("All products' data has already been scraped. Skipping the product scraping process.");
	}
	return skipProductScraping;
}

export function getRequiredProductCategories() {
	return getProductCategoriesToScrape({ logInfo: false, noScrapeCheckFilter: true });
}

function getProductCategoriesToScrape(options = { logInfo: true, noScrapeCheckFilter: false }) {
	const { logInfo, noScrapeCheckFilter } = options;

	let productCategoryIds = [];
	const normalizedCategoriesData = JSON.parse(fs.readFileSync(PATHS.NORMALIZED_CATEGORIES_JSON, 'utf-8'));

	const categoriesToScrape = config.CATEGORIES_TO_SCRAPE || [];

	for (const categoryIdToScrape of categoriesToScrape) {
		const categoryToScrape = normalizedCategoriesData[categoryIdToScrape];

		if (categoryToScrape.isProductCategory) {
			productCategoryIds.push(categoryIdToScrape);
			continue;
		}

		if (categoryToScrape.isSubCategory) {
			for (const categoryId in normalizedCategoriesData) {
				const category = normalizedCategoriesData[categoryId];
				const categoryIsRequiredProductCategory =
					category.isProductCategory && category.subCategoryId === categoryIdToScrape;
				if (categoryIsRequiredProductCategory) {
					productCategoryIds.push(category.id);
				}
			}
			continue;
		}

		if (categoryToScrape.isMainCategory) {
			for (const categoryId in normalizedCategoriesData) {
				const category = normalizedCategoriesData[categoryId];
				const categoryIsRequiredProductCategory =
					category.isProductCategory && category.mainCategoryId === categoryIdToScrape;
				if (categoryIsRequiredProductCategory) {
					productCategoryIds.push(category.id);
				}
			}
			continue;
		}
	}

	/*
	 ** We have to deal with duplicate product category additions in instances where
	 ** CATEGORIES_TO_SCRAPE contains a product category, and a main/sub category that
	 ** also contains the same product category.
	 */
	productCategoryIds = [...new Set(productCategoryIds)];

	if (productCategoryIds.length === 0) {
		if (logInfo) {
			console.log('No valid config found. Scraping all product categories...');
		}

		productCategoryIds = Object.values(normalizedCategoriesData).reduce((acc, category) => {
			if (category.isProductCategory) {
				acc.push(category.id);
			}
			return acc;
		}, []);
	}

	if (noScrapeCheckFilter) {
		return productCategoryIds.map((productCategoryId) => {
			const productCategory = normalizedCategoriesData[productCategoryId];
			productCategory.subCategory = normalizedCategoriesData[productCategory.subCategoryId];
			productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategoryId];
			return productCategory;
		});
	}

	const filteredProductCategoryIds = productCategoryIds.filter((productCategoryId) => {
		const productCategoryDataExists = fs.existsSync(
			path.join(PATHS.PRODUCTS_DATA_DIR, `${productCategoryId}.xlsx`)
		);
		return !productCategoryDataExists;
	});

	if (logInfo) {
		console.log(
			`${productCategoryIds.length - filteredProductCategoryIds.length} (out of ${
				productCategoryIds.length
			}) product categories have already been scraped.`
		);
	}

	return filteredProductCategoryIds.map((productCategoryId) => {
		const productCategory = normalizedCategoriesData[productCategoryId];
		productCategory.subCategory = normalizedCategoriesData[productCategory.subCategoryId];
		productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategoryId];
		return productCategory;
	});
}

async function getTotalProductPages(page, itemsPerPage) {
	const totalItemsText = await page.$eval('.index__total--hiD2n', (el) => el.textContent);
	const totalItemsMatch = totalItemsText.match(/Total (\d+) items/);
	const totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1], 10) : 0;
	const totalPages = Math.ceil(totalItems / itemsPerPage);

	console.log(`Total items: ${totalItems}, Total pages: ${totalPages}`);
	return { totalProductCategoryItems: totalItems, totalProductCategoryPages: totalPages };
}

async function scrapeProductsFromCategory(context, productCategory) {
	const {
		name: productCategoryName,
		id: productCategoryId,
		mainCategory: { id: mainCategoryId, name: mainCategoryName },
		subCategory: { id: subCategoryId, name: subCategoryName },
	} = productCategory;

	console.log('\n***\n');
	console.log(`Scraping products from the product category "${productCategoryName} (ID: ${productCategoryId})"...`);
	console.log(
		`Parent categories: ${mainCategoryName} (ID: ${mainCategoryId}) > ${subCategoryName} (ID: ${subCategoryId})`
	);

	const maxProductsPerPage = 60;

	const url = `${CANTON_FAIR_URL}detailed?category=${mainCategoryId}&scategory=${productCategoryId}&size=${maxProductsPerPage}`;
	const page = await context.newPage();
	await page.goto(url);
	await page.waitForLoadState('load');

	await page.waitForTimeout(STANDARD_TIMEOUT.XM_MS);

	const { totalProductCategoryItems, totalProductCategoryPages } = await getTotalProductPages(
		page,
		maxProductsPerPage
	);

	let existingProductPagesCount = 0;
	const productCategoryDataPath = path.join(PATHS.PRODUCTS_DATA_DIR, `${productCategoryId}.json`);
	if (fs.existsSync(productCategoryDataPath)) {
		const existingProductPages = JSON.parse(fs.readFileSync(productCategoryDataPath, 'utf-8'));
		existingProductPagesCount = existingProductPages.length;
	}

	if (existingProductPagesCount === totalProductCategoryPages) {
		console.log('- All products in this product category have already been scraped.');
		return;
	}

	let totalProductsInPage = maxProductsPerPage;
	for (let i = existingProductPagesCount + 1; i <= totalProductCategoryPages; i++) {
		if (i > 1) {
			await page.goto(`${url}&page=${i}`);
			await page.waitForLoadState('load');
			await page.waitForTimeout(STANDARD_TIMEOUT.XM_MS);
		}

		if (i === totalProductCategoryPages) {
			totalProductsInPage = totalProductCategoryItems % maxProductsPerPage;
		}

		console.log(`- Fetching ~${totalProductsInPage} products from page ${i} of ${totalProductCategoryPages}...`);

		const scrapedProducts = await scrapeProductsOnPage(context, page);

		appendToJSONArrFile(productCategoryDataPath, scrapedProducts);
	}
}

async function scrapeProductsOnPage(context, page) {
	const productCards = await page.locator('.index__ProductCard--LIttx').elementHandles();
	const products = [];

	for (const card of productCards) {
		const image = await card.$eval('.index__img--R37kn', (el) =>
			el.style.backgroundImage.replace(/url\("(.+)"\)/, '$1')
		);
		const title = await card.$eval('.index__title--sIKzt', (el) => el.textContent);
		const tags = await card.$$eval('.index__tag--YjxvG', (nodes) => nodes.map((node) => node.textContent.trim()));
		const companyElement = await card.$('.index__company--R66AE');
		const company = await companyElement.evaluate((el) => el.textContent);
		const companyLink = await companyElement.evaluate((el) => el.getAttribute('href'));
		const isLocked = (await card.$$('.index__lock--UmiPo')).length > 0;

		let productURL = null;
		if (!isLocked) {
			await card.click();
			const newPage = await context.waitForEvent('page');
			await newPage.waitForLoadState('domcontentloaded');
			productURL = await newPage.url();
			await newPage.close();
		}

		products.push({
			image,
			title: title?.trim(),
			tags,
			company: company?.trim(),
			companyLink,
			isLocked,
			productURL,
		});
	}

	return products.filter((product) => !product.isLocked);
}

export async function scrapeProducts(context) {
	const productCategories = getProductCategoriesToScrape();

	for (let i = 0, totalCategories = productCategories.length; i < totalCategories; i++) {
		const categoryQuantityStr = productCategories.length - i === 1 ? 'category' : 'categories';

		console.log(`${productCategories.length - i} product ${categoryQuantityStr} yet to be scraped...`);
		const productCategory = productCategories[i];

		await scrapeProductsFromCategory(context, productCategory);

		const outputDir = PATHS.PRODUCTS_DATA_DIR;
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir);
		}

		const workbook = writeProductsDataToExcelWorkbook({
			worksheetName: 'Products',
			productCategory,
			productsArray: JSON.parse(
				fs.readFileSync(path.join(PATHS.PRODUCTS_DATA_DIR, `${productCategory.id}.json`), 'utf-8')
			),
			withExhibitorData: false,
		});
		const outputFilePath = path.join(outputDir, `${productCategory.id}.xlsx`);
		await workbook.xlsx.writeFile(outputFilePath);
		console.log(`Excel file created for the category "${productCategory.name}": ${outputFilePath}`);
	}
}

function writeProductsDataToExcelWorkbook({
	workbook,
	worksheetName,
	productCategory,
	productsArray,
	withExhibitorData,
}) {
	if (!workbook) {
		workbook = new ExcelJS.Workbook();
	}
	const worksheet = workbook.addWorksheet(worksheetName);

	let exhibitorsInfo = {};
	if (withExhibitorData) {
		worksheet.columns = [
			{ header: `Product · ${productCategory.name}`, key: 'title', width: 80 },
			{ header: 'Tags', key: 'tags', width: 120 },
			{ header: 'Exhibitor', key: 'exhibitor', width: 60 },
			{ header: 'Product URL', key: 'productURL', width: 90 },
			{ header: 'Exhibitor · Contact', key: 'exhibitorPerson', width: 24 },
			{ header: 'Exhibitor · Email', key: 'exhibitorEmail', width: 40 },
			{ header: 'Exhibitor · Region', key: 'exhibitorRegion', width: 40 },
			{ header: 'Exhibitor · Mobile', key: 'exhibitorMobile', width: 24 },
			{ header: 'Exhibitor · Telephone', key: 'exhibitorTelephone', width: 24 },
			{ header: 'Exhibitor · Fax', key: 'exhibitorFax', width: 24 },
			{ header: 'Exhibitor · Website', key: 'exhibitorWebsite', width: 60 },
			{ header: 'Exhibitor Shop URL', key: 'exhibitorShopURL', width: 60 },
			{ header: 'Product Image', key: 'productImageURL', width: 100 },
		];
		exhibitorsInfo = JSON.parse(fs.readFileSync(PATHS.EXHIBITORS_JSON, 'utf-8'));
	} else {
		worksheet.columns = [
			{ header: `Product · ${productCategory.name}`, key: 'title', width: 80 },
			{ header: 'Tags', key: 'tags', width: 120 },
			{ header: 'Exhibitor', key: 'exhibitor', width: 60 },
			{ header: 'Product URL', key: 'productURL', width: 90 },
			{ header: 'Exhibitor Shop URL', key: 'exhibitorShopURL', width: 60 },
			{ header: 'Product Image', key: 'productImageURL', width: 100 },
		];
	}

	const uniqueProducts = new Set(productsArray.flat().map((product) => JSON.stringify(product)));

	const isURL = (str) => /^(https|http|www|\.com|\.cn)/.test(str);

	uniqueProducts.forEach((productStr) => {
		const product = JSON.parse(productStr);
		const productURL = product.productURL.replace('?search=', '');
		const companyURL = product.companyLink.replace('?keyword=#/', '').replace('/en-US/', CANTON_FAIR_URL);
		const productImageURL = isURL(product.image) ? product.image.split('?')[0] : '';
		if (withExhibitorData) {
			const exhibitorId = product.companyLink.replace('?keyword=#/', '').replace('/en-US/shops/', '');
			const exhibitor = exhibitorsInfo[exhibitorId];

			worksheet.addRow({
				title: product.title,
				tags: product.tags.join(', '),
				exhibitor: product.company,
				productURL: { text: productURL, hyperlink: productURL },
				exhibitorPerson: exhibitor.contactPerson,
				exhibitorEmail: exhibitor.email,
				exhibitorRegion: exhibitor.countryRegion,
				exhibitorMobile: exhibitor.mobilePhone,
				exhibitorTelephone: exhibitor.telephone,
				exhibitorFax: exhibitor.fax,
				exhibitorWebsite: exhibitor.website,
				exhibitorShopURL: { text: companyURL, hyperlink: companyURL },
				productImageURL: productImageURL ? { text: productImageURL, hyperlink: productImageURL } : '',
			});
		} else {
			worksheet.addRow({
				title: product.title,
				tags: product.tags.join(', '),
				exhibitor: product.company,
				productURL: { text: productURL, hyperlink: productURL },
				exhibitorShopURL: { text: companyURL, hyperlink: companyURL },
				productImageURL: productImageURL ? { text: productImageURL, hyperlink: productImageURL } : '',
			});
		}
	});

	// Make the header row sticky
	worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

	// Stylize the header row
	worksheet.getRow(1).eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
		cell.alignment = { vertical: 'middle', horizontal: 'center' };
		cell.protection = { locked: true };
	});
	worksheet.autoFilter = withExhibitorData ? { from: 'A1', to: 'M1' } : { from: 'A1', to: 'F1' };

	// Stylize the URL columns
	['productURL', 'exhibitorShopURL', 'productImageURL'].forEach((column) => {
		worksheet.getColumn(column).eachCell((cell, rowNumber) => {
			// Skip the header row
			if (rowNumber === 1) {
				return;
			}
			cell.font = { color: { argb: 'FF0000FF' }, underline: true, color: { theme: 10 } };
		});
	});

	return workbook;
}

export function curateRequiredDataInExcel(options = { withExhibitorData: true }) {
	const normalizedCategoriesData = JSON.parse(fs.readFileSync(PATHS.NORMALIZED_CATEGORIES_JSON, 'utf-8'));

	let workbook = new ExcelJS.Workbook();
	const productsInfoWorksheet = workbook.addWorksheet('Products');

	const requiredProductCategoryIds = getRequiredProductCategories().map((category) => category.id);
	const productFiles = fs.readdirSync(PATHS.PRODUCTS_DATA_DIR).filter((file) => {
		const isJSONFile = file.endsWith('.json');
		const productCategoryId = file.replace('.json', '');

		return isJSONFile && requiredProductCategoryIds.includes(productCategoryId);
	});

	productFiles.sort((a, b) => {
		const aCategory = normalizedCategoriesData[a.replace('.json', '')];
		const bCategory = normalizedCategoriesData[b.replace('.json', '')];
		return aCategory.categoryPath.localeCompare(bCategory.categoryPath);
	});

	for (const productFile of productFiles) {
		const productCategoryId = productFile.replace('.json', '');
		const productCategory = normalizedCategoriesData[productCategoryId];

		productCategory.subCategory = normalizedCategoriesData[productCategory.subCategoryId];
		productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategoryId];

		const productsArray = JSON.parse(fs.readFileSync(path.join(PATHS.PRODUCTS_DATA_DIR, productFile), 'utf-8'));
		productCategory.productsCount = new Set(productsArray.flat().map((product) => JSON.stringify(product))).size;

		workbook = writeProductsDataToExcelWorkbook({
			workbook,
			worksheetName: `CID_${productCategoryId}`,
			productCategory,
			productsArray,
			withExhibitorData: options.withExhibitorData,
		});
	}

	productsInfoWorksheet.columns = [
		{ header: 'Product Category', key: 'categoryPath', width: 120 },
		{ header: 'Count', key: 'productsCount', width: 10 },
		{ header: 'Sheet', key: 'productSheetName', width: 30 },
	];

	productFiles.forEach((productFile) => {
		const productCategoryId = productFile.replace('.json', '');
		const productCategory = normalizedCategoriesData[productCategoryId];

		productsInfoWorksheet.addRow({
			categoryPath: productCategory.categoryPath,
			productsCount: productCategory.productsCount,
			productSheetName: { text: `CID_${productCategoryId}`, hyperlink: `#'CID_${productCategoryId}'!A1` },
		});
	});

	// Make the header row sticky
	productsInfoWorksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

	// Stylize the header row
	productsInfoWorksheet.getRow(1).eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
		cell.alignment = { vertical: 'middle', horizontal: 'center' };
		cell.protection = { locked: true };
	});
	productsInfoWorksheet.autoFilter = { from: 'A1', to: 'C1' };

	// Bold the product category names
	productsInfoWorksheet.getColumn('categoryPath').eachCell((cell, rowNumber) => {
		// Skip the header row
		if (rowNumber === 1) {
			return;
		}
		const parts = cell.value.split(' > ');
		cell.value = {
			richText: parts.map((part, index) => ({
				text: part + (index < parts.length - 1 ? ' > ' : ''),
				font: index === parts.length - 1 ? { bold: true } : {},
			})),
		};
	});

	productsInfoWorksheet.getColumn('productSheetName').eachCell((cell, rowNumber) => {
		// Skip the header row
		if (rowNumber === 1) {
			return;
		}
		cell.alignment = { horizontal: 'right' };
		cell.font = { color: { argb: 'FF0000FF' }, underline: true, color: { theme: 10 } };
	});

	console.log('\n***\n');
	console.log(
		`Creating an Excel file for all the available ${productFiles.length} product categories,${
			options.withExhibitorData ? ' with exhibitor data, ' : ' '
		}at ${PATHS.CURATED_PRODUCTS_XLSX} ...`
	);
	workbook.xlsx.writeFile(PATHS.CURATED_PRODUCTS_XLSX);
}
