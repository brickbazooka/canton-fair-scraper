import fs from 'fs';
import { chromium } from 'playwright';

import { SESSION_STORAGE_PATH } from './constants.js';

import { logInToCantonFair } from './auth.js';
import { extractProductCategories, navigateToCategory } from './scrapers/categories.js';

(async () => {
	const browser = await chromium.launch({ headless: false });
	let context;

	if (fs.existsSync(SESSION_STORAGE_PATH)) {
		console.log('Loading existing session...');
		context = await browser.newContext({ storageState: SESSION_STORAGE_PATH });
	} else {
		console.log('No saved session found. Creating a new session...');
		context = await browser.newContext();
		await context.storageState({ path: SESSION_STORAGE_PATH });
	}

	const page = await context.newPage();
	await logInToCantonFair(page);

	const categories = await extractProductCategories(page);
	console.log({ categories });

	await navigateToCategory(page, context, categories);

	// await browser.close();
})();
