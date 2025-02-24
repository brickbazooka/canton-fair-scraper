import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { get } from 'http';

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

function normalizeCategoriesData(categoriesData) {
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
					normalized[mainCategory.id] = mainCategory;
				}
				if (!normalized[subCategory.id]) {
					normalized[subCategory.id] = subCategory;
				}
				if (!normalized[productCategory.id]) {
					normalized[productCategory.id] = {
						...productCategory,
						subCategory: subCategory.id,
						mainCategory: mainCategory.id,
					};
				}

				normalized.productCategories.push(productCategory.id);
			}
		}
		return normalized;
	}
	return traverseCategories(categoriesData);
}

function getCategoryInsights(categoriesData) {
	// checkInternationalPavilionPaths(categoriesData);
	// printSameEndCategoryPaths(categoriesData);
	// printMaxHierarchyDepth(categoriesData);
	// printNumDepthCategories(categoriesData, 3);

	const normalizedCategoriesData = normalizeCategoriesData(categoriesData);
	const findDuplicates = (arr) => arr.filter((item, index) => arr.indexOf(item) !== index);
	const duplicates = findDuplicates(normalizedCategoriesData.productCategories);
	if (duplicates.length > 0) {
		console.error('Duplicate product categories found:');
		console.error(duplicates);
	}
	fs.writeFileSync(
		path.join(
			path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]):\//, '$1:/'),
			'..',
			'..',
			'data',
			'normalized_categories.json'
		),
		JSON.stringify(normalizedCategoriesData, null, 2)
	);
}

async function createExcelFilesFromProducts(productsData, normalizedCategoriesData) {
	for (const categoryId in productsData) {
		const productCategory = normalizedCategoriesData[categoryId];
		productCategory.subCategory = normalizedCategoriesData[productCategory.subCategory];
		productCategory.mainCategory = normalizedCategoriesData[productCategory.mainCategory];

		const products = productsData[categoryId];
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Products');

		worksheet.columns = [
			{ header: 'Main Category', key: 'mainCategory', width: 30 },
			// { header: 'Sub Category', key: 'subCategory', width: 30 },
			{ header: 'Product Category', key: 'productCategory', width: 30 },
			{ header: 'Product', key: 'title', width: 30 },
			{ header: 'Tags', key: 'tags', width: 30 },
			{ header: 'Company', key: 'company', width: 30 },
			{ header: 'Product URL', key: 'productURL', width: 30 },
			{ header: 'Company Link', key: 'companyLink', width: 30 },
			{ header: 'Image', key: 'image', width: 30 },
		];

		products.forEach((product) => {
			worksheet.addRow({
				mainCategory: productCategory.mainCategory.name,
				// subCategory: productCategory.subCategory.name,
				productCategory: productCategory.name,
				title: product.title,
				tags: product.tags.join(', '),
				company: product.company,
				productURL: product.productURL,
				companyLink: product.companyLink,
				image: product.image,
			});
		});

		const outputDir = path.join(getDataPath(), 'products');
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir);
		}

		const outputFilePath = path.join(getDataPath(), 'products', `${categoryId}.xlsx`);
		await workbook.xlsx.writeFile(outputFilePath);
		console.log(`Excel file created for category ${categoryId}: ${outputFilePath}`);
	}
}

// ***
const getDataPath = () => {
	return path.join(
		path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]):\//, '$1:/'),
		'..',
		'..',
		'data'
	);
};
const getDataFilePath = (fileName) => path.join(getDataPath(), fileName);
const getData = (fileName) => JSON.parse(fs.readFileSync(getDataFilePath(fileName), 'utf-8'));

const getAllProducts = (datdDirName = 'products') => {
	const productsDir = path.join(getDataPath(), datdDirName);
	const productFiles = fs.readdirSync(productsDir).filter((file) => file.endsWith('.json'));

	return productFiles.reduce((acc, file) => {
		const categoryId = file.replace(/\.json$/, '');
		acc[categoryId] = JSON.parse(fs.readFileSync(path.join(productsDir, file), 'utf-8')).flat();
		return acc;
	}, {});
};

// getCategoryInsights(getData('categories.json'));
createExcelFilesFromProducts(getAllProducts('products'), getData('normalized_categories.json'));
