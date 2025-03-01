import config from '../config.js';

import { loginSequence } from './scrapers/auth.js';
import { scrapeCategories, shouldSkipCategoryScraping } from './scrapers/categories.js';
import { scrapeProducts, curateAllProductsDataInExcel } from './scrapers/products.js';
import { scrapeExhibitors } from './scrapers/exhibitors.js';

import { withTimer, logScrapingError } from './utils.js';

async function scrapingSequence(scrapingTargetType, options) {
	let scrapeFunc;
	switch (scrapingTargetType) {
		case 'category':
			if (shouldSkipCategoryScraping()) {
				return { error: null, browser: null };
			}
			scrapeFunc = scrapeCategories;
			break;
		case 'product':
			scrapeFunc = scrapeProducts;
			break;
		case 'exhibitor':
			scrapeFunc = scrapeExhibitors;
			break;
		default:
			const errorMessage = `Invalid scraping target type: ${scrapingTargetType}`;
			console.error(errorMessage);
			return { error: new Error(errorMessage), browser: null };
	}

	const { browser, context, page } = await loginSequence(options);

	try {
		await scrapeFunc(context, page);

		await browser.close();
		return { error: null, browser: null };
	} catch (error) {
		logScrapingError(error, scrapingTargetType);
		return { error, browser };
	}
}

async function errorTolerantScrapingSequence(scrapingTargetType, options) {
	if (options.logMessage) {
		console.log(options.logMessage);
	}

	const { error, browser } = await scrapingSequence(scrapingTargetType, options);

	if (error) {
		console.log('Closing the browser...');
		await browser.close();
		await errorTolerantScrapingSequence(scrapingTargetType, {
			...options,
			logMessage: `Retrying ${scrapingTargetType} scraping sequence...`,
		});
	}
}

async function runScrapingSequence() {
	await errorTolerantScrapingSequence('category', { headless: true });

	await errorTolerantScrapingSequence('product', { headless: true });

	if (config.SHOULD_SCRAPE_EXHIBITORS) {
		await errorTolerantScrapingSequence('exhibitor', { headless: true });
	}

	curateAllProductsDataInExcel({ withExhibitorData: config.SHOULD_SCRAPE_EXHIBITORS });
}

withTimer(runScrapingSequence)();
