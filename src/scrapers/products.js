import fs from 'fs';
import path from 'path';

import ExcelJS from 'exceljs';

import { CANTON_FAIR_URL, STANDARD_TIMEOUT, PATHS } from '../constants.js';
import { appendToJSONArrFile } from '../utils.js';

async function getTotalProductPages(page, itemsPerPage) {
	const totalItemsText = await page.$eval('.index__total--hiD2n', (el) => el.textContent);
	const totalItemsMatch = totalItemsText.match(/Total (\d+) items/);
	const totalItems = totalItemsMatch ? parseInt(totalItemsMatch[1], 10) : 0;
	const totalPages = Math.ceil(totalItems / itemsPerPage);

	console.log(`Total items: ${totalItems}, Total pages: ${totalPages}`);
	return totalPages;
}

export async function extractProductsFromCategory(context, productCategory) {
	const {
		name: productCategoryName,
		id: productCategoryId,
		mainCategory: { id: mainCategoryId, name: mainCategoryName },
		subCategory: { id: subCategoryId, name: subCategoryName },
	} = productCategory;

	console.log('\n***\n');
	console.log(`Extracting products from the product category "${productCategoryName} (ID: ${productCategoryId})"...`);
	console.log(
		`Parent categories: ${mainCategoryName} (ID: ${mainCategoryId}) > ${subCategoryName} (ID: ${subCategoryId})`
	);

	const maxProductsPerPage = 60;

	const url = `${CANTON_FAIR_URL}detailed?category=${mainCategoryId}&scategory=${productCategoryId}&size=${maxProductsPerPage}`;
	const page = await context.newPage();
	await page.goto(url);
	await page.waitForLoadState('load');

	await page.waitForTimeout(STANDARD_TIMEOUT.XM_MS);

	const totalProductPages = await getTotalProductPages(page, maxProductsPerPage);

	let existingProductPagesCount = 0;
	const productCategoryDataPath = path.join(PATHS.PRODUCTS_DATA_DIR, `${productCategoryId}.json`);
	if (fs.existsSync(productCategoryDataPath)) {
		const existingProductPages = JSON.parse(fs.readFileSync(productCategoryDataPath, 'utf-8'));
		existingProductPagesCount = existingProductPages.length;
	}

	if (existingProductPagesCount === totalProductPages) {
		console.log('- All products in this product category have already been extracted.');
		return;
	}

	for (let i = existingProductPagesCount + 1; i <= totalProductPages; i++) {
		if (i > 1) {
			await page.goto(`${url}&page=${i}`);
			await page.waitForLoadState('load');
			await page.waitForTimeout(STANDARD_TIMEOUT.XM_MS);
		}
		console.log(`- Fetching ~${maxProductsPerPage} products from page ${i} of ${totalProductPages}...`);
		const extractedProducts = await extractProductsOnPage(context, page);

		appendToJSONArrFile(productCategoryDataPath, extractedProducts);
	}
}

async function extractProductsOnPage(context, page) {
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
			await newPage.waitForLoadState('domcontentloaded', { timeout: 10 * STANDARD_TIMEOUT.XXL_MS });
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

export function writeProductsDataToExcelWorkbook({ workbook, worksheetName, productCategory, productsArray }) {
	if (!workbook) {
		workbook = new ExcelJS.Workbook();
	}
	const worksheet = workbook.addWorksheet(worksheetName);

	worksheet.columns = [
		{ header: `Product · ${productCategory.categoryPath}`, key: 'title', width: 80 },
		{ header: 'Tags', key: 'tags', width: 120 },
		{ header: 'Exhibitor', key: 'company', width: 60 },
		{ header: 'Product URL', key: 'productURL', width: 90 },
		{ header: 'Exhibitor URL', key: 'companyURL', width: 60 },
		{ header: 'Product Image URL', key: 'imageURL', width: 100 },
	];

	const uniqueProducts = new Set(productsArray.flat().map((product) => JSON.stringify(product)));

	uniqueProducts.forEach((productStr) => {
		const product = JSON.parse(productStr);
		const productURL = product.productURL.replace('?search=', '');
		const companyURL = product.companyLink.replace('?keyword=#/', '').replace('/en-US/', CANTON_FAIR_URL);
		const imageURL = product.image.includes('https://') ? product.image.split('?')[0] : '';
		worksheet.addRow({
			title: product.title,
			tags: product.tags.join(', '),
			company: product.company,
			productURL: { text: productURL, hyperlink: productURL },
			companyURL: { text: companyURL, hyperlink: companyURL },
			imageURL: imageURL ? { text: imageURL, hyperlink: imageURL } : '',
		});
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
	worksheet.autoFilter = { from: 'A1', to: 'F1' };

	// Stylize the URL columns
	['productURL', 'companyURL', 'imageURL'].forEach((column) => {
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

export function curateAllProductsDataInExcel() {
	const normalizedCategoriesData = JSON.parse(fs.readFileSync(PATHS.NORMALIZED_CATEGORIES_JSON, 'utf-8'));

	let workbook = new ExcelJS.Workbook();
	const productsInfoWorksheet = workbook.addWorksheet('Products');

	const productFiles = fs.readdirSync(PATHS.PRODUCTS_DATA_DIR).filter((file) => file.endsWith('.json'));

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

	workbook.xlsx.writeFile(PATHS.CURATED_PRODUCTS_XLSX);
	console.log('\n***\n');
	console.log(
		`Excel file created for all the available ${productFiles.length} product categories: ${PATHS.CURATED_PRODUCTS_XLSX}`
	);
}
