import config from '../config.js';

import { loginSequence } from './scrapers/auth.js';
import { scrapeCategories, shouldSkipCategoryScraping } from './scrapers/categories.js';
import { scrapeProducts, shouldSkipProductScraping, curateAllProductsDataInExcel } from './scrapers/products.js';
import { scrapeExhibitors, shouldSkipExhibitorScraping } from './scrapers/exhibitors.js';

import { withTimer, logScrapingError } from './utils.js';

async function scrapingSequence(scrapingTargetType, options) {
	const scrapingTypeToFuncMap = {
		category: {
			shouldSkipScraping: shouldSkipCategoryScraping,
			scrapeFunc: scrapeCategories,
		},
		product: {
			shouldSkipScraping: shouldSkipProductScraping,
			scrapeFunc: scrapeProducts,
		},
		exhibitor: {
			shouldSkipScraping: shouldSkipExhibitorScraping,
			scrapeFunc: scrapeExhibitors,
		},
	};

	const { shouldSkipScraping, scrapeFunc } = scrapingTypeToFuncMap[scrapingTargetType];

	if (shouldSkipScraping()) {
		return { error: null, browser: null };
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
