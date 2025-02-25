import path from 'path';
import { fileURLToPath } from 'url';

export const CANTON_FAIR_URL = 'https://www.cantonfair.org.cn/en-US/';

export const STANDARD_TIMEOUT = {
	XXXS_MS: 100,
	XXS_MS: 500,
	XS_MS: 1000,
	XM_MS: 3000,
	XL_MS: 5000,
	XXL_MS: 10000,
	XXXL_MS: 30000,
};

const SCRAPED_DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');

export const PATHS = {
	SESSION_STORAGE: path.join(SCRAPED_DATA_DIR, 'canton_fair_session.json'),
	CATEGORIES_JSON: path.join(SCRAPED_DATA_DIR, 'categories.json'),
	NORMALIZED_CATEGORIES_JSON: path.join(SCRAPED_DATA_DIR, 'normalized_categories.json'),
	PRODUCTS_DATA_DIR: path.join(SCRAPED_DATA_DIR, 'products'),
	CURATED_PRODUCTS_XLSX: path.join(SCRAPED_DATA_DIR, 'curated.xlsx'),
};
