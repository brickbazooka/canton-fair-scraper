import fs from 'fs';
import { chromium } from 'playwright';

import { CANTON_FAIR_URL, STANDARD_TIMEOUT, SESSION_STORAGE_PATH } from './constants.js';

import { isLoggedIn, logInToCantonFair } from './auth.js';
import {
	extractMainCategories,
	navigateToMainCategoryPage,
	curateCategories,
	normalizeCategoriesData,
} from './scrapers/categories.js';
import { extractProductsFromCategory } from './scrapers/products.js';
import { appendToJSONArrFile, appendToJSONObjFile } from './utils.js';

async function loginSequence(options = { headless: true }) {
	const { headless } = options;
	const browser = await chromium.launch({ headless });
	let context;

	if (fs.existsSync(SESSION_STORAGE_PATH)) {
		console.log('Loading existing session...');
		context = await browser.newContext({ storageState: SESSION_STORAGE_PATH });
	} else {
		console.log('No saved session found. Creating a new session...');
		context = await browser.newContext();
	}

	const page = await context.newPage();

	await page.goto(CANTON_FAIR_URL);
	await page.waitForLoadState('domcontentloaded');

	if (!(await isLoggedIn(page))) {
		console.log('Not logged in. Instantiating the login process in a new browser...');

		/*
		 ** The reason behind closing the browser here (and then reopening it below by calling loginSequence() again with a "logged in" session),
		 ** is to retain the choice of executing the scraping process in a headless browser.
		 **
		 ** Since the login process requires manual CAPTCHA solving, we have no other choice but to do it in a non-headless browser
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

	const { browser, context, page } = await loginSequence();

	const categories = await extractMainCategories(page);

	const categoriesData = [];
	for (let i = 0, totalCategories = categories.length; i < totalCategories; i++) {
		const { categoryPage, categoryId, categoryName } = await navigateToMainCategoryPage(page, context, {
			name: categories[i],
			index: i,
		});
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XL_MS);
		const pageCategories = await curateCategories(categoryPage);
		const categoryPageDatum = { id: categoryId, name: categoryName, subCategories: pageCategories };

		appendToJSONArrFile('./data/categories.json', categoryPageDatum);
		categoriesData.push(categoryPageDatum);

		await categoryPage.close();
	}

	const normalizedCategoriesData = normalizeCategoriesData(categoriesData);
	fs.writeFileSync('./data/normalized_categories.json', JSON.stringify(normalizedCategoriesData, null, 2));

	await browser.close();
}

async function productExtractionSequence(options = { headless: true }) {
	const { browser, context, page } = await loginSequence(options);

	const normalizedCategoriesData = JSON.parse(fs.readFileSync('./data/normalized_categories.json', 'utf-8'));

	const { productCategories } = normalizedCategoriesData;

	// let products = {};

	// TODO: Remove the "1 ||" part of the loop condition
	for (let i = 0, totalCategories = 1 || productCategories.length; i < totalCategories; i++) {
		const productCategoryId = productCategories[i];
		const productCategory = normalizedCategoriesData[productCategoryId];

		productCategory.subCategory = normalizedCategoriesData[productCategory.subCategory];
		productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategory];

		await extractProductsFromCategory(context, productCategory);
		// const extractedProducts = await extractProductsFromCategory(context, productCategory, products);
		// products[productCategoryId] = extractedProducts;
	}

	// appendToJSONObjFile('./data/products.json', products);
	await browser.close();
}

(async () => {
	await categoryExtractionSequence();

	const productSequenceTime = {
		start: new Date().toLocaleString(),
		end: null,
	};
	console.log(`Starting product extraction sequence at ${productSequenceTime.start}...`);
	await productExtractionSequence({ headless: false });
	productSequenceTime.end = new Date().toLocaleString();
	console.log('Product extraction sequnce time:', JSON.stringify(productSequenceTime, null, 2));
})();
