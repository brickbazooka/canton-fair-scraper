import { STANDARD_TIMEOUT } from '../constants.js';

async function extractCategoryIdsFromURL(page) {
	const url = page.url();
	const categoryMatch = url.match(/category=([0-9]+)/);
	const subCategoryMatch = url.match(/scategory=([0-9]+)/);
	return {
		categoryId: categoryMatch ? categoryMatch[1] : null,
		subCategoryId: subCategoryMatch ? subCategoryMatch[1] : null,
	};
}

export async function extractMainCategories(page) {
	const categories = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('.page__item--X870u .kylin-text__text')).map((el) =>
			el.textContent.trim()
		);
	});

	return categories;
}

export async function navigateToMainCategoryPage(page, context, category) {
	const { name: categoryName, index: categoryIndex } = category;

	const categorySelector = `.page__item--X870u:nth-of-type(${categoryIndex + 1})`;
	await page.click(categorySelector);
	const categoryPage = await context.waitForEvent('page');

	await categoryPage.waitForLoadState('load');
	const { categoryId } = await extractCategoryIdsFromURL(categoryPage);

	console.log(`Navigated to category: ${categoryName} - ${categoryId}`);
	return { categoryPage, categoryId, categoryName };
}

export async function curateCategories(categoryPage) {
	const pageCategories = await categoryPage.$$eval('.index__Collapse--RUAbD[id]', (nodes) => {
		return nodes.map((node) => {
			const titleText = node.querySelector('.index__text--lKhSS')?.textContent.trim() || '';
			const titleMatch = titleText.match(/(.*)\((\d+)\)$/);
			const subCategories = Array.from(node.querySelectorAll('li.index__item--ZSYkz.index__option--PoIIn')).map(
				(sub) => ({
					name: sub.querySelector('span:first-child')?.textContent.trim() || '',
					count: parseInt(
						sub.querySelector('span:last-child')?.textContent.trim().replace(/\(|\)/g, '') || '0',
						10
					),
				})
			);
			return {
				id: node.id,
				name: titleMatch ? titleMatch[1].trim() : titleText,
				count: titleMatch ? parseInt(titleMatch[2], 10) : 0,
				subCategories: subCategories,
			};
		});
	});

	if (pageCategories.length === 0) {
		console.error(
			'No categories found. Possible reasons: incorrect selector, elements not present on the page, or page not fully loaded. Please verify the selector ".index__Collapse--RUAbD[id]" and ensure the page content is loaded correctly.'
		);
	}
	for (const category of pageCategories) {
		console.log(
			`Processing the ${category.subCategories.length} subcategories of "${category.name}" (COUNT: ID: ${category.count} | ${category.id})...`
		);

		// Click the category to expand the list of subcategories, and wait for the category to expand
		const categoryElement = await categoryPage.locator(`.index__Collapse--RUAbD[id="${category.id}"]`).first();
		await categoryElement.click();
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XS_MS);

		for (const subCategory of category.subCategories) {
			console.log(`Fetching meta for the subcategory: ${subCategory.name} (${subCategory.count})...`);

			// Click the subcategory and wait for the page to load (and the URL to change)
			const subCategoryElement = await categoryPage
				.locator(
					`.index__Collapse--RUAbD[id="${category.id}"] li.index__item--ZSYkz.index__option--PoIIn:has-text("${subCategory.name}")`
				)
				.first();
			await subCategoryElement.click();
			await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XS_MS);

			const { subCategoryId } = await extractCategoryIdsFromURL(categoryPage);
			subCategory.id = subCategoryId;
		}
	}

	return pageCategories;
}
