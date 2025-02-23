import fs from 'fs';
import path from 'path';

const categoriesFilePath = path.join(
	path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]):\//, '$1:/'),
	'..',
	'..',
	'data',
	'categories.json'
);

function getAllCategoryPaths(categoriesData) {
	const paths = [];
	function traverseCategories(categories, parentPath = '') {
		for (const category of categories) {
			if (category.name === 'International Pavilion' || category.name === 'Trade Services') {
				continue;
			}
			const { id: categoryId, name: categoryName, subCategories } = category;
			const categoryIdText = categoryId;
			// const categoryIdText = `len(catID): ${categoryId.length}`;
			const currentPath = parentPath
				? `${parentPath} -> ${categoryName} (${categoryIdText})`
				: `${categoryName} (${categoryIdText})`;
			if (!subCategories || subCategories.length === 0) {
				paths.push(currentPath);
			}
			if (subCategories && subCategories.length > 0) {
				traverseCategories(subCategories, currentPath);
			}
		}
	}
	traverseCategories(categoriesData);
	return paths;
}

function getPathsByEndCategoryIDs(categoriesData) {
	// return getAllCategoryPaths(categoriesData).reduce((acc, path) => {
	return getAllValidCategoryPaths(categoriesData).reduce((acc, path) => {
		const id = path.match(/\(([^)]+)\)$/)[1];
		if (!acc[id]) {
			acc[id] = [];
		}
		acc[id].push(path);
		return acc;
	}, {});
}

function checkInternationalPavilionPaths(categoriesData) {
	const internationalPavilionPaths = getAllCategoryPaths(categoriesData).filter((path) =>
		path.startsWith('International Pavilion (null) -> ')
	);
	const pathsByEndCategoryIDs = getPathsByEndCategoryIDs(categoriesData);

	for (const path of internationalPavilionPaths) {
		const endId = path.match(/\(([^)]+)\)$/)[1];
		console.log('\n\n***\n\n');
		if (pathsByEndCategoryIDs[endId].length === 1) {
			console.log(`Paths ending with ID ${endId}:`);
			pathsByEndCategoryIDs[endId].forEach((p) => console.log(p));
		}
	}
}

function printSameEndCategoryPaths(categoriesData) {
	const pathsByEndCategoryIDs = getPathsByEndCategoryIDs(categoriesData);
	let totalSameEndPaths = 0;
	for (const id in pathsByEndCategoryIDs) {
		if (pathsByEndCategoryIDs[id].length > 1) {
			totalSameEndPaths++;
			console.log('\n\n***\n\n');
			console.log(`Paths ending with ID ${id}:`);
			pathsByEndCategoryIDs[id].forEach((path) => console.log(path));
		}
	}
	console.log('\n\n***\n\n');
	console.log(`Total paths with same destinations: ${totalSameEndPaths}`);
}

function printMaxHierarchyDepth(categoriesData) {
	const paths = getAllCategoryPaths(categoriesData);
	const maxDepth = paths.reduce((max, path) => {
		const depth = path.split(' -> ').length;
		return depth > max ? depth : max;
	}, 0);
	console.log(`Max hierarchy depth: ${maxDepth}`);
}

function printNumDepthCategories(categoriesData, num) {
	const paths = getAllCategoryPaths(categoriesData);
	const twoDepthPaths = paths.filter((path) => path.split(' -> ').length === num);
	twoDepthPaths.forEach((path) => console.log(path));
}

function objectifyCategoryStr(categoryStr) {
	const match = categoryStr.match(/^(.*) \(([^)]+)\)$/);
	return {
		name: match[1].trim(),
		id: match[2].trim(),
	};
}

function getAllValidCategoryPaths(categoriesData) {
	const paths = [];
	function traverseCategories(categories, parentPath = '') {
		for (const category of categories) {
			if (category.name === 'International Pavilion' || category.name === 'Trade Services') {
				continue;
			}
			const { id: categoryId, name: categoryName, subCategories } = category;
			const currentPath = parentPath
				? `${parentPath} -> ${categoryName} (${categoryId})`
				: `${categoryName} (${categoryId})`;
			if (!subCategories) {
				if (currentPath.split(' -> ').length !== 3) {
					throw new Error(`Invalid path, there is something wrong here: ${currentPath}`);
				}
				const [mainCategory, subCategory, endCategory] = currentPath.split(' -> ').map(objectifyCategoryStr);

				// if (mainCategory.id.length !== 18 || subCategory.id.length !== 18 || endCategory.id.length !== 18) {
				// 	console.log('\n\n****\n\n');
				// 	console.log(currentPath);
				// }
				// if (subCategory.id.length !== 18) {
				// 	console.error(
				// 		`Invalid category ID length for a subcategory: ${subCategory.name} (${subCategory.id})`
				// 	);
				// }
				if (mainCategory.id.length !== 18 || endCategory.id.length !== 18) {
					// console.error(
					// 	`Invalid category ID length for a/an main/end category: ${mainCategory.name} (${mainCategory.id}) OR ${endCategory.name} (${endCategory.id})`
					// );
					continue;
				}

				paths.push(currentPath);
			}
			if (subCategories && subCategories.length > 0) {
				traverseCategories(subCategories, currentPath);
			}
		}
	}
	traverseCategories(categoriesData);
	return paths;
}

function getNewCategoryStructure(categoriesData) {
	const validPaths = getAllValidCategoryPaths(categoriesData);
	console.log(`Total valid product categories: ${validPaths.length}`);
	const newCategoryStructure = validPaths.reduce((acc, categoryPath) => {
		const [mainCategory, subCategory, endCategory] = categoryPath.split(' -> ').map(objectifyCategoryStr);
		if (!acc[mainCategory.id]) {
			acc[mainCategory.id] = [];
		}
		// YUCK! This is a bad way to do this. But it's a quick and dirty solution for now.
		acc[mainCategory.id].push({
			productCategory: endCategory,
			subCategory,
			mainCategory,
			categoryPath,
		});
		return acc;
	}, {});
	return newCategoryStructure;
}

function getCategoryInsights(categoriesFilePath) {
	const categoriesData = JSON.parse(fs.readFileSync(categoriesFilePath, 'utf-8'));

	// checkInternationalPavilionPaths(categoriesData);
	// printSameEndCategoryPaths(categoriesData);
	// printMaxHierarchyDepth(categoriesData);
	// printNumDepthCategories(categoriesData, 3);

	const newCategoryStructure = getNewCategoryStructure(categoriesData);
	Object.keys(newCategoryStructure).forEach((mainCategoryID) => {
		console.log(
			`Total product categories under ${newCategoryStructure[mainCategoryID][0].mainCategory.name}: ${newCategoryStructure[mainCategoryID].length}`
		);
	});
	fs.writeFileSync(
		path.join(
			path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]):\//, '$1:/'),
			'..',
			'..',
			'data',
			'new_category_structure.json'
		),
		JSON.stringify(newCategoryStructure, null, 2)
	);
	// console.log(JSON.stringify(newCategoryStructure, null, 2));
}

getCategoryInsights(categoriesFilePath);
