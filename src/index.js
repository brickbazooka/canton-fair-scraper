import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

import { CANTON_FAIR_URL, STANDARD_TIMEOUT, SESSION_STORAGE_PATH } from './constants.js';

import config from '../config.js';

import { isLoggedIn, logInToCantonFair } from './scrapers/auth.js';
import {
	extractMainCategories,
	navigateToMainCategoryPage,
	extractSubCategories,
	normalizeCategoriesData,
} from './scrapers/categories.js';
import { extractProductsFromCategory, createExcelWorkbookFromProductsJSON } from './scrapers/products.js';

async function loginSequence(options = { headless: true }) {
	const { headless } = options;
	const browser = await chromium.launch({ headless });
	let context;

	console.log('\n***\n');
	if (fs.existsSync(SESSION_STORAGE_PATH)) {
		console.log('Launched a new browser. Loading existing session...');
		context = await browser.newContext({ storageState: SESSION_STORAGE_PATH });
	} else {
		console.log('Launched a new browser. No saved session found. Creating a new session...');
		context = await browser.newContext();
	}
	console.log('\n***\n');

	const page = await context.newPage();

	await page.goto(CANTON_FAIR_URL);
	await page.waitForLoadState('domcontentloaded');

	if (!(await isLoggedIn(page))) {
		console.log('Not logged in. Instantiating the login process in a new browser...');

		/*
		 ** Since the login process requires manual CAPTCHA solving, we have no other choice but to do the login process in a non-headless (visible) browser.
		 ** However, we can still choose to execute the scraping process in a headless (non-visible) browser.
		 **
		 ** And that is the reason behind closing the browser here, and then reopening it below (by calling loginSequence() again with a "logged in" session).
		 ** It's done to retain the choice of executing the scraping process in a headless/non-headless browser, irrespective of the login process.
		 **
		 */
		await browser.close();
		await logInToCantonFair();
		console.log('Logged in successfully. Reopening a new browser...');
		return loginSequence();
	}

	return { browser, context, page };
}

async function categoryExtractionSequence(options = { headless: true }) {
	if (fs.existsSync('./data/normalized_categories.json')) {
		console.log("Normalized categories' data already exists. Skipping the category extraction process.");
		return;
	}

	const { browser, context, page } = await loginSequence(options);

	const categories = await extractMainCategories(page);

	for (let i = 0, totalCategories = categories.length; i < totalCategories; i++) {
		const { categoryPage, categoryId, categoryName } = await navigateToMainCategoryPage(page, context, {
			name: categories[i],
			index: i,
		});
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XL_MS);
		await extractSubCategories({ categoryId, categoryName, categoryPage });

		await categoryPage.close();
	}

	const categoriesData = fs.readFileSync('./data/categories.json', 'utf-8');
	const normalizedCategoriesData = normalizeCategoriesData(JSON.parse(categoriesData));
	fs.writeFileSync('./data/normalized_categories.json', JSON.stringify(normalizedCategoriesData, null, 2));

	await browser.close();
}

async function productExtractionSequence(options = { headless: true }) {
	const { browser, context, page } = await loginSequence(options);

	let productCategories = [];
	const normalizedCategoriesData = JSON.parse(fs.readFileSync('./data/normalized_categories.json', 'utf-8'));

	const categoriesToScrape = config.CATEGORIES_TO_SCRAPE || [];

	for (const categoryIdToScrape of categoriesToScrape) {
		const categoryToScrape = normalizedCategoriesData[categoryIdToScrape];

		if (categoryToScrape.isProductCategory) {
			productCategories.push(categoryIdToScrape);
			continue;
		}

		if (categoryToScrape.isSubCategory) {
			for (const categoryId in normalizedCategoriesData) {
				const category = normalizedCategoriesData[categoryId];
				const categoryIsRequiredProductCategory =
					category.isProductCategory && category.subCategoryId === categoryIdToScrape;
				if (categoryIsRequiredProductCategory) {
					productCategories.push(category.id);
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
					productCategories.push(category.id);
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
	productCategories = [...new Set(productCategories)];

	if (productCategories.length === 0) {
		console.log('No valid config found. Scraping all product categories...');
		productCategories = normalizedCategoriesData.productCategories;
	}

	console.log(`${productCategories.length} product categories to scrape...`);
	try {
		for (let i = 0, totalCategories = productCategories.length; i < totalCategories; i++) {
			const productCategoryId = productCategories[i];
			const productCategory = normalizedCategoriesData[productCategoryId];

			if (fs.existsSync(`./data/products/${productCategoryId}.xlsx`)) {
				console.log(
					`- (${
						i + 1
					}/${totalCategories}) ${productCategoryId}.xlsx exists. Skipping the product extraction process for ${
						productCategory.name
					} (ID: ${productCategoryId}).`
				);
				continue;
			}

			productCategory.subCategory = normalizedCategoriesData[productCategory.subCategoryId];
			productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategoryId];

			await extractProductsFromCategory(context, productCategory);

			const outputDir = path.join('./data', 'products');
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir);
			}

			const workbook = createExcelWorkbookFromProductsJSON(
				productCategoryId,
				JSON.parse(fs.readFileSync(`./data/products/${productCategoryId}.json`, 'utf-8')),
				normalizedCategoriesData
			);
			const outputFilePath = path.join(outputDir, `${productCategoryId}.xlsx`);
			await workbook.xlsx.writeFile(outputFilePath);
			console.log(
				`Excel file created for category ${productCategory.name} (ID: ${productCategoryId}): ${outputFilePath}`
			);
		}

		await browser.close();
		return { error: null, browser: null };
	} catch (error) {
		console.log('\n***\n');
		console.error('An error occurred while extracting products:', error);
		console.log('\n***\n');

		return { error, browser };
	}
}

async function errorTolerantProductExtractionSequence(options = { headless: true }) {
	const { error, browser } = await productExtractionSequence(options);

	if (error) {
		console.log('Closing the browser...');
		await browser.close();
		console.log('Retrying product extraction sequence...');
		await errorTolerantProductExtractionSequence(options);
	}
}

(async () => {
	const categoryExtractionOptions = { headless: true };
	const productExtractionOptions = { headless: true };

	await categoryExtractionSequence(categoryExtractionOptions);

	await errorTolerantProductExtractionSequence(productExtractionOptions);
})();
