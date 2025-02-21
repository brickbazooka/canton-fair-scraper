import { WAIT_FOR_TIMEOUT_MS } from '../constants.js';

export async function extractProductCategories(page) {
	const categories = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('.page__item--X870u .kylin-text__text')).map((el) =>
			el.textContent.trim()
		);
	});

	return categories;
}

export async function navigateToCategory(page, context, categories, categoryIndex = 0) {
	if (categories.length === 0) {
		console.log('No categories found.');
		return;
	}

	if (categoryIndex < 0 || categoryIndex >= categories.length) {
		console.log('Invalid category index.');
		return;
	}

	const categorySelector = `.page__item--X870u:nth-of-type(${categoryIndex + 1})`;
	const [newPage] = await Promise.all([context.waitForEvent('page'), page.click(categorySelector)]);

	await newPage.waitForLoadState('domcontentloaded');
	await newPage.waitForTimeout(WAIT_FOR_TIMEOUT_MS);
	const pageTitle = await newPage.title();
	console.log(`Navigated to category: ${categories[categoryIndex]} - ${pageTitle}`);
}
