# Canton Fair Scraper

A scraper for extracting product and category information from the (2025) [Canton Fair](https://www.cantonfair.org.cn/en-US/) website.

It

-   logs in to the Canton Fair website, based on the provided credentials.
-   extracts the main categories, subcategories, and product categories.
-   extracts product details (for specific/all categories) including images, tags, exhibitor information, and product URLs.
-   generates Excel files from the extracted product data, for each product category.

## Usage

1. Clone the repository:

```bash
git clone https://github.com/brickbazooka/canton-fair-scraper.git
cd canton-fair-scraper
```

2. Install the dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory and add your Canton Fair credentials:

```bash
cp .env.example .env
```

Edit the `.env` file and fill in your credentials:

```
CANTON_FAIR_USERTYPE='Overseas Buyer / Purchasing Agent'
CANTON_FAIR_USERNAME='your-canton-fair-username'
CANTON_FAIR_EMAIL='your-canton-fair-email'
CANTON_FAIR_PASSWORD='your-canton-fair-password'
```

4. Start the scraper:

```bash
npm start
```

## Configuration

The scraper can be configured using the `./config.js` file. You can specify the categories to scrape by adding their IDs to the `CATEGORIES_TO_SCRAPE` array.

```javascript
// Leave this empty to scrape all categories
const CATEGORIES_TO_SCRAPE = [
	'461147962869833728', // Electronics & Appliance > Household Electrical Appliances > Home Appliances
	'461147343081705472', // Health & Recreation > Medicines, Health Products and Medical Devices
];

export default {
	CATEGORIES_TO_SCRAPE,
};
```
