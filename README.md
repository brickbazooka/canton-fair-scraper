# Canton Fair Scraper

A scraper for extracting product and category information from the (2025) [Canton Fair](https://www.cantonfair.org.cn/en-US/) website.

It

-   logs in to the Canton Fair website, based on the provided credentials.
-   scrapes metadata of all the main categories, subcategories, and product categories.
-   scrapes product details (for specific/all categories) including images, tags, exhibitor information, and corresponding URLs.
-   generates an Excel file curating all the scraped information.

## Requirements

-   [NodeJS](https://nodejs.org/en/download/) (v18 or higher)
-   A registered "Overseas Buyer / Purchasing Agent" account on the [Canton Fair](https://www.cantonfair.org.cn/en-US/) website
-   A company registered under your account, [here](https://www.cantonfair.org.cn/member/embeddedpage/index?url=best-sitetraderinfo&menu=227277909705273346)

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
CANTON_FAIR_USERTYPE="Overseas Buyer / Purchasing Agent"
CANTON_FAIR_USERNAME="EXAMPLE USERNAME"
CANTON_FAIR_EMAIL="example@gmail.com"
CANTON_FAIR_PASSWORD="example_password"
```

4. Start the scraper:

```bash
npm start
```

## Configuration

The scraper can be configured using the `./config.js` file. You can

-   leave the `CATEGORIES_TO_SCRAPE` array empty, to scrape all categories.

    ```javascript
    const CATEGORIES_TO_SCRAPE = []; // You probably shouldn't do this
    // ...
    ```

-   specify the categories to scrape, by adding their IDs to the `CATEGORIES_TO_SCRAPE` array.

    ```javascript
    const CATEGORIES_TO_SCRAPE = [
    	'461147245295706112', // Electronics & Appliance
    	'461148188821164032', // Fashion > Shoes
    	'461148007081988096', // Health & Recreation > Food > Candies
    ];
    // ...
    ```

-   enable/disable scraping exhibitor contact information, by setting `SHOULD_SCRAPE_EXHIBITORS` to `true` or `false`.
    ```javascript
    // ...
    export default {
    	CATEGORIES_TO_SCRAPE,
    	SHOULD_SCRAPE_EXHIBITORS: true,
    };
    ```
