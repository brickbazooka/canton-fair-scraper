import { STANDARD_TIMEOUT } from '../constants.js';
import { appendToJSONArrFile } from '../utils.js';

function extractCategoryIdsFromURL(url) {
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
	const categoryPageURL = await categoryPage.url();
	const { categoryId } = extractCategoryIdsFromURL(categoryPageURL);

	console.log('\n***\n');
	console.log(`Navigated to category: ${categoryName} - ${categoryId}`);
	return { categoryPage, categoryId, categoryName };
}

export async function extractSubCategories({ categoryId, categoryName, categoryPage }) {
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
			'No categories found. ' +
				'Possible reasons: incorrect selector, elements not present on the page, or page not fully loaded. ' +
				'Please verify the selector ".index__Collapse--RUAbD[id]" and ensure the page content is loaded correctly.'
		);
		return;
	}

	for (const category of pageCategories) {
		console.log('\n');
		console.log(
			`Processing the ${category.subCategories.length} product categories of "${category.name}" (COUNT: ${category.count} | ID: ${category.id})...`
		);

		// Click the category to expand the list of subcategories, and wait for the category to expand
		const categoryElement = await categoryPage.locator(`.index__Collapse--RUAbD[id="${category.id}"]`).first();
		await categoryElement.click();
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XS_MS);

		let currentURL = await categoryPage.url();
		for (const subCategory of category.subCategories) {
			console.log(`- Fetching meta for the product category: ${subCategory.name} (${subCategory.count})...`);

			// Click the subcategory and wait for the page to load (and the URL to change)
			const subCategoryElement = await categoryPage
				.locator(
					`.index__Collapse--RUAbD[id="${category.id}"] li.index__item--ZSYkz.index__option--PoIIn:has-text("${subCategory.name}(${subCategory.count})")`
				)
				.first();

			await subCategoryElement.click();
			await categoryPage.waitForFunction(
				(previousURL) => location.href !== previousURL,
				{ timeout: STANDARD_TIMEOUT.XM_MS },
				currentURL
			);
			currentURL = await categoryPage.url();

			const { subCategoryId } = extractCategoryIdsFromURL(currentURL);
			subCategory.id = subCategoryId;
		}
	}

	const categoryPageDatum = { id: categoryId, name: categoryName, subCategories: pageCategories };
	appendToJSONArrFile('./data/categories.json', categoryPageDatum);
	return pageCategories;
}

export function normalizeCategoriesData(categoriesData) {
	function objectifyCategoryStr(categoryStr) {
		const match = categoryStr.match(/^(.*) \(([^)]+)\)$/);
		return {
			name: match[1].trim(),
			id: match[2].trim(),
		};
	}

	function traverseCategories(categories, parentPath = '', normalized = { productCategories: [] }) {
		for (const category of categories) {
			if (category.name === 'International Pavilion' || category.name === 'Trade Services') {
				continue;
			}
			const { id: categoryId, name: categoryName, subCategories } = category;
			const currentPath = parentPath
				? `${parentPath} -> ${categoryName} (${categoryId})`
				: `${categoryName} (${categoryId})`;

			if (subCategories?.length > 0) {
				traverseCategories(subCategories, currentPath, normalized);
			}

			if (!subCategories) {
				if (currentPath.split(' -> ').length !== 3) {
					throw new Error(`Invalid path for a product category: ${currentPath}`);
				}
				const [mainCategory, subCategory, productCategory] = currentPath
					.split(' -> ')
					.map(objectifyCategoryStr);

				if (mainCategory.id.length !== 18 || productCategory.id.length !== 18) {
					console.error(
						'Invalid category ID length for a/an main/end category: ' +
							`${mainCategory.name} (${mainCategory.id}) OR ${productCategory.name} (${productCategory.id})`
					);
					continue;
				}
				if (!normalized[mainCategory.id]) {
					normalized[mainCategory.id] = { ...mainCategory, isMainCategory: true };
				}
				if (!normalized[subCategory.id]) {
					normalized[subCategory.id] = {
						...subCategory,
						mainCategoryId: mainCategory.id,
						isSubCategory: true,
					};
				}
				if (!normalized[productCategory.id]) {
					normalized[productCategory.id] = {
						...productCategory,
						subCategoryId: subCategory.id,
						mainCategoryId: mainCategory.id,
						isProductCategory: true,
						categoryPath: `${mainCategory.name} > ${subCategory.name} > ${productCategory.name}`,
					};
				}

				normalized.productCategories.push(productCategory.id);
			}
		}
		return normalized;
	}
	return traverseCategories(categoriesData);
}
