import fs from 'fs';

import { STANDARD_TIMEOUT, PATHS } from '../constants.js';
import { appendToJSONArrFile } from '../utils.js';

export function shouldSkipCategoryScraping() {
	const skipCategoryScraping = fs.existsSync(PATHS.NORMALIZED_CATEGORIES_JSON);
	if (skipCategoryScraping) {
		console.log('\n***\n');
		console.log("Normalized categories' data already exists. Skipping the category scraping process.");
	}
	return skipCategoryScraping;
}

function extractCategoryIdsFromURL(url) {
	const categoryMatch = url.match(/category=([0-9]+)/);
	const subCategoryMatch = url.match(/scategory=([0-9]+)/);
	return {
		categoryId: categoryMatch ? categoryMatch[1] : null,
		subCategoryId: subCategoryMatch ? subCategoryMatch[1] : null,
	};
}

async function scrapeMainCategories(page) {
	const categories = await page.evaluate(() => {
		return Array.from(document.querySelectorAll('.page__item--X870u .kylin-text__text')).map((el) =>
			el.textContent.trim()
		);
	});

	return categories;
}

async function navigateToMainCategoryPage(page, context, category) {
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

async function scrapeSubCategories({ categoryId, categoryName, categoryPage }) {
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
		const categoryQuantityStr = category.subCategories.length === 1 ? 'category' : 'categories';
		console.log(
			`Processing the ${category.subCategories.length} product ${categoryQuantityStr} of "${category.name}" (COUNT: ${category.count} | ID: ${category.id})...`
		);

		// Click the category to expand the list of subcategories, and wait for the category to expand
		const categoryElement = await categoryPage.locator(`.index__Collapse--RUAbD[id="${category.id}"]`).first();
		await categoryElement.click();
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XS_MS);

		let currentURL = await categoryPage.url();
		for (const subCategory of category.subCategories) {
			console.log(`- Scraping meta for the product category: ${subCategory.name} (${subCategory.count})...`);

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
	appendToJSONArrFile(PATHS.CATEGORIES_JSON, categoryPageDatum);
	return pageCategories;
}

export async function scrapeCategories(context, page) {
	const categories = await scrapeMainCategories(page);

	let existingCategories = [];
	if (fs.existsSync(PATHS.CATEGORIES_JSON)) {
		existingCategories = JSON.parse(fs.readFileSync(PATHS.CATEGORIES_JSON, 'utf-8'));
	}

	for (let i = 0, totalCategories = categories.length; i < totalCategories; i++) {
		const categoryExists = existingCategories.some((category) => category.name === categories[i]);
		if (categoryExists) {
			console.log('\n***\n');
			console.log(`Category "${categories[i]}" has already been scraped. Skipping...`);
			continue;
		}

		const { categoryPage, categoryId, categoryName } = await navigateToMainCategoryPage(page, context, {
			name: categories[i],
			index: i,
		});
		await categoryPage.waitForTimeout(STANDARD_TIMEOUT.XL_MS);
		await scrapeSubCategories({ categoryId, categoryName, categoryPage });

		await categoryPage.close();
	}

	const categoriesData = fs.readFileSync(PATHS.CATEGORIES_JSON, 'utf-8');
	const normalizedCategoriesData = normalizeCategoriesData(JSON.parse(categoriesData));
	fs.writeFileSync(PATHS.NORMALIZED_CATEGORIES_JSON, JSON.stringify(normalizedCategoriesData, null, 2));
}

function normalizeCategoriesData(categoriesData) {
	console.log('\n***\n');
	console.log('Normalizing categories data...');

	function objectifyCategoryStr(categoryStr) {
		const match = categoryStr.match(/^(.*) \(([^)]+)\)$/);
		return {
			name: match[1].trim(),
			id: match[2].trim(),
		};
	}

	function traverseCategories(categories, parentPath = '', normalized = {}) {
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
					const productCategoryPath = `${mainCategory.name} > ${productCategory.name}`;
					console.error(
						`- Skipping a category with an invalid category ID length: ${productCategoryPath} (${productCategory.id})`
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
			}
		}
		return normalized;
	}
	return traverseCategories(categoriesData);
}
