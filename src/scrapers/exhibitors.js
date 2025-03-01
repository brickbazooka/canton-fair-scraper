import fs from 'fs';
import path from 'path';

import { CANTON_FAIR_URL, PATHS } from '../constants.js';

import { appendToJSONObjFile } from '../utils.js';

async function scrapeExhibitorContacts(context, exhibitorURL) {
	const page = await context.newPage();
	await page.goto(exhibitorURL);

	await page.getByText('Contact Us').first().click();

	const viewCompanyContactButton = await page.getByRole('button', { name: "View company's contact" });
	if (viewCompanyContactButton) {
		await viewCompanyContactButton.click();
		const contactDetails = await page.$$eval('.index__ContactInfoSections--WHmlE .index__row--GoCEM', (rows) => {
			const details = {};
			rows.forEach((row) => {
				const items = row.querySelectorAll('.index__item--vuNk7');
				items.forEach((item) => {
					const label = item.querySelector('.index__name--KiZnD').textContent.trim();
					const value = item.querySelector('.index__content--HCLQC').textContent.trim();
					details[label] = value;
				});
			});
			return details;
		});

		const exhibitorContactDetails = {
			name: contactDetails['Company Name'],
			website: contactDetails['Company website'],
			address: contactDetails['Address'],
			countryRegion: contactDetails['Country/Region'],
			zipCode: contactDetails['Zip code'],
			contactPerson: contactDetails['Contact Person'],
			telephone: contactDetails['Telephone'],
			mobilePhone: contactDetails['Mobile Phone'],
			fax: contactDetails['Fax'],
			email: contactDetails['Email'],
		};

		await page.close();
		return exhibitorContactDetails;
	}
}

export async function scrapeExhibitors(context) {
	const exhibitors = getExhibitorsToScrape();

	const totalExhibitors = Object.keys(exhibitors).length;

	console.log(`Scraping exhibitors...`);

	let existingExhibitors = {};
	if (fs.existsSync(PATHS.EXHIBITORS_JSON)) {
		existingExhibitors = JSON.parse(fs.readFileSync(PATHS.EXHIBITORS_JSON, 'utf-8'));
	}

	const filteredExhibitorIds = Object.keys(exhibitors).filter((exhibitorId) => !existingExhibitors[exhibitorId]);
	const remainingExhibitors = filteredExhibitorIds.length;

	if (remainingExhibitors === 0) {
		console.log(`All ${totalExhibitors} exhibitors have already been scraped.`);
		return;
	}

	console.log(
		`${totalExhibitors - remainingExhibitors} (out of ${totalExhibitors}) exhibitors have already been scraped.`
	);
	console.log(`${remainingExhibitors} exhibitors yet to be scraped...`);

	let counter = 0;
	for (const exhibitorId of filteredExhibitorIds) {
		const exhibitorURL = exhibitors[exhibitorId];
		const companyContactDetails = await scrapeExhibitorContacts(context, exhibitorURL);
		appendToJSONObjFile(PATHS.EXHIBITORS_JSON, {
			[exhibitorId]: companyContactDetails,
		});
		counter++;
		console.log(`- Processed ${counter}/${remainingExhibitors} exhibitor${counter === 1 ? '' : 's'}.`);
	}

	console.log(`All ${totalExhibitors} exhibitors have been scraped.`);
}

function getExhibitorsToScrape() {
	let productFiles = fs.readdirSync(PATHS.PRODUCTS_DATA_DIR).filter((file) => file.endsWith('.json'));

	const exhibitors = {};
	productFiles
		.map((productFile) => {
			const productsArray = JSON.parse(fs.readFileSync(path.join(PATHS.PRODUCTS_DATA_DIR, productFile), 'utf-8'));
			const flatArray = productsArray.flat();
			return flatArray;
		})
		.flat()
		.forEach((product) => {
			const exhibitorId = product.companyLink.replace('?keyword=#/', '').replace('/en-US/shops/', '');
			exhibitors[exhibitorId] = `${product.companyLink.replace('/en-US/', CANTON_FAIR_URL)}contact`;
		});

	return exhibitors;
}
