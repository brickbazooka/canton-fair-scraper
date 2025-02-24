import fs from 'fs';

import { STANDARD_TIMEOUT } from '../constants.js';
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

	console.log('\n\n***\n\n');
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
	// const result = [];

	// Determine the starting page number based on the number of entries in `./data/products/${productCategoryId}.json`
	let existingProductPagesCount = 0;
	if (fs.existsSync(`./data/products/${productCategoryId}.json`)) {
		const existingProductPages = JSON.parse(fs.readFileSync(`./data/products/${productCategoryId}.json`, 'utf-8'));
		existingProductPagesCount = existingProductPages.length;
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
		// result.push(...extractedProducts);
	}

	// return result;
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

	// return products;
	return products.filter((product) => !product.isLocked);
}
