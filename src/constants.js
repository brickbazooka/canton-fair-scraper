import path from 'path';
import { fileURLToPath } from 'url';

export const CANTON_FAIR_URL = 'https://www.cantonfair.org.cn/en-US/';

export const CANTON_FAIR_LOGIN_URL = `${CANTON_FAIR_URL}login/mall/index?redirect_uri=https%3A%2F%2Fwww.cantonfair.org.cn%2Fen-US#/login`;

export const STANDARD_TIMEOUT = {
	XS_MS: 1000,
	XM_MS: 3000,
	XL_MS: 5000,
};

const SCRAPED_DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');

export const PATHS = {
	SESSION_STORAGE: path.join(SCRAPED_DATA_DIR, 'canton_fair_session.json'),
	CATEGORIES_JSON: path.join(SCRAPED_DATA_DIR, 'categories.json'),
	NORMALIZED_CATEGORIES_JSON: path.join(SCRAPED_DATA_DIR, 'normalized_categories.json'),
	PRODUCTS_DATA_DIR: path.join(SCRAPED_DATA_DIR, 'products'),
	EXHIBITORS_JSON: path.join(SCRAPED_DATA_DIR, 'exhibitors.json'),
	CURATED_PRODUCTS_XLSX: path.join(SCRAPED_DATA_DIR, 'curated.xlsx'),
};
