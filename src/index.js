import config from '../config.js';

import { loginSequence } from './scrapers/auth.js';
import { scrapeCategories, shouldSkipCategoryScraping } from './scrapers/categories.js';
import { scrapeProducts, curateAllProductsDataInExcel } from './scrapers/products.js';
import { scrapeExhibitors } from './scrapers/exhibitors.js';

import { withTimer, logScrapingError } from './utils.js';

async function categoryScrapingSequence(options = { headless: true }) {
	if (shouldSkipCategoryScraping()) {
		return { error: null, browser: null };
	}

	const { browser, context, page } = await loginSequence(options);

	try {
		await scrapeCategories(context, page);

		await browser.close();
		return { error: null, browser: null };
	} catch (error) {
		logScrapingError(error, 'category');
		return { error, browser };
	}
}

async function productScrapingSequence(options = { headless: true }) {
	const { browser, context } = await loginSequence(options);

	try {
		await scrapeProducts(context);

		await browser.close();
		return { error: null, browser: null };
	} catch (error) {
		logScrapingError(error, 'product');
		return { error, browser };
	}
}

async function exhibitorScrapingSequence(options = { headless: true }) {
	const { browser, context } = await loginSequence(options);

	try {
		await scrapeExhibitors(context);

		await browser.close();
		return { error: null, browser: null };
	} catch (error) {
		logScrapingError(error, 'exhibitor');
		return { error, browser };
	}
}

async function errorTolerantScrapingSequence(scrapingSequenceFunc, type, options) {
	if (options.logMessage) {
		console.log(options.logMessage);
	}

	const { error, browser } = await scrapingSequenceFunc(options);

	if (error) {
		console.log('Closing the browser...');
		await browser.close();
		await errorTolerantScrapingSequence(scrapingSequenceFunc, type, {
			...options,
			logMessage: `Retrying ${type} scraping sequence...`,
		});
	}
}

async function runScrapingSequence() {
	await errorTolerantScrapingSequence(categoryScrapingSequence, 'category', { headless: true });

	await errorTolerantScrapingSequence(productScrapingSequence, 'product', { headless: true });

	if (config.SHOULD_SCRAPE_EXHIBITORS) {
		await errorTolerantScrapingSequence(exhibitorScrapingSequence, 'exhibitor', { headless: true });
	}

	curateAllProductsDataInExcel({ withExhibitorData: config.SHOULD_SCRAPE_EXHIBITORS });
}

withTimer(runScrapingSequence)();
