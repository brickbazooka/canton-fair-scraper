import fs from 'fs';
import { chromium } from 'playwright';

import { SESSION_STORAGE_PATH, STANDARD_TIMEOUT } from './constants.js';

import { logInToCantonFair } from './auth.js';
import { extractMainCategories, navigateToMainCategoryPage, curateCategories } from './scrapers/categories.js';
import { appendToJSONFile } from './utils.js';

(async () => {
	const browser = await chromium.launch({ headless: false });
	let context;

	if (fs.existsSync(SESSION_STORAGE_PATH)) {
		console.log('Loading existing session...');
		context = await browser.newContext({ storageState: SESSION_STORAGE_PATH });
	} else {
		console.log('No saved session found. Creating a new session...');
		context = await browser.newContext();
	}

	const page = await context.newPage();
	await logInToCantonFair(page);
	await context.storageState({ path: SESSION_STORAGE_PATH });

	const categories = await extractMainCategories(page);

	for (let i = 0, totalCategories = categories.length; i < totalCategories; i++) {
		const { categoryPage, categoryId, categoryName } = await navigateToMainCategoryPage(page, context, {
			name: categories[i],
			index: i,
		});
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XL_MS);
		const pageCategories = await curateCategories(categoryPage);
		const categoryPageDatum = { id: categoryId, name: categoryName, subCategories: pageCategories };
		appendToJSONFile('./data/categories.json', categoryPageDatum);

		await categoryPage.close();
	}

	await browser.close();
})();
