import fs from 'fs';
import ExcelJS from 'exceljs';

import { CANTON_FAIR_URL, STANDARD_TIMEOUT } from '../constants.js';
import { appendToJSONArrFile } from '../utils.js';
import { text } from 'stream/consumers';

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

	const url = `https://www.cantonfair.org.cn/en-US/detailed?category=${mainCategoryId}&scategory=${productCategoryId}&size=${maxProductsPerPage}`;
	const page = await context.newPage();
	await page.goto(url);
	await page.waitForLoadState('load');

	await page.waitForTimeout(STANDARD_TIMEOUT.XM_MS);

	const totalProductPages = await getTotalProductPages(page, maxProductsPerPage);

	// Determine the starting page number based on the number of entries in `./data/products/${productCategoryId}.json`
	let existingProductPagesCount = 0;
	if (fs.existsSync(`./data/products/${productCategoryId}.json`)) {
		const existingProductPages = JSON.parse(fs.readFileSync(`./data/products/${productCategoryId}.json`, 'utf-8'));
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

		appendToJSONArrFile(`./data/products/${productCategoryId}.json`, extractedProducts);
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

export function createExcelWorkbookFromProductsJSON(productCategoryId, productsArray, normalizedCategoriesData) {
	const productCategory = normalizedCategoriesData[productCategoryId];
	productCategory.subCategory = normalizedCategoriesData[productCategory.subCategoryId];
	productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategoryId];

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Products');

	worksheet.columns = [
		{ header: `Product · ${productCategory.categoryPath}`, key: 'title', width: 80 },
		{ header: 'Tags', key: 'tags', width: 80 },
		{ header: 'Exhibitor', key: 'company', width: 60 },
		{ header: 'Product URL', key: 'productURL', width: 90 },
		{ header: 'Exhibitor URL', key: 'companyLink', width: 30 },
		{ header: 'Product Image URL', key: 'imageURL', width: 100 },
	];

	// Stylize the header row
	worksheet.getRow(1).eachCell((cell) => {
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
		cell.alignment = { vertical: 'middle', horizontal: 'center' };
		cell.protection = { locked: true };
	});
	worksheet.autoFilter = { from: 'A1', to: 'F1' };

	const uniqueProducts = new Set(productsArray.flat().map((product) => JSON.stringify(product)));
	uniqueProducts.forEach((productStr) => {
		const product = JSON.parse(productStr);
		const productURL = product.productURL.replace('?search=', '');
		const companyLink = product.companyLink.replace('?keyword=#/', '').replace('/en-US/', CANTON_FAIR_URL);
		const imageURL = product.image.includes('https://') ? product.image.split('?')[0] : '';
		worksheet.addRow({
			title: product.title,
			tags: product.tags.join(', '),
			company: product.company,
			productURL: { text: productURL, hyperlink: productURL },
			companyLink: { text: companyLink, hyperlink: companyLink },
			imageURL: { text: imageURL ? imageURL : 'No image', hyperlink: imageURL },
		});
	});

	return workbook;
}
