import { chromium } from 'playwright';
import readline from 'readline';

import { CANTON_FAIR_URL, STANDARD_TIMEOUT, PATHS } from '../constants.js';

import dotenv from 'dotenv';
dotenv.config();

const { CANTON_FAIR_USERTYPE, CANTON_FAIR_USERNAME, CANTON_FAIR_EMAIL, CANTON_FAIR_PASSWORD } = process.env;

export async function isLoggedIn(page) {
	try {
		await page.waitForSelector('.index__name--Whtb3', { timeout: STANDARD_TIMEOUT.XM_MS });
		const userName = await page.evaluate(() =>
			document.getElementsByClassName('index__name--Whtb3')[0].innerText.trim()
		);
		return userName === CANTON_FAIR_USERNAME;
	} catch (error) {
		return false;
	}
}

export async function logInToCantonFair() {
	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();

	await page.goto(CANTON_FAIR_URL);
	await page.waitForLoadState('domcontentloaded');

	await page.getByText('Login', { exact: true }).click();
	await page.waitForLoadState('load');

	await page.getByText(CANTON_FAIR_USERTYPE, { exact: true }).click();
	await page.waitForLoadState('load');

	const userInputSelector = 'input[placeholder="Please enter your account or email"]';
	const userPasswordSelector = 'input[placeholder=" Please enter your password "]';

	await page.waitForSelector(userInputSelector);
	await page.fill(userInputSelector, CANTON_FAIR_EMAIL);

	await page.waitForSelector(userPasswordSelector);
	await page.fill(userPasswordSelector, CANTON_FAIR_PASSWORD);

	await page.click('.el-checkbox'); // Check the agreement checkbox

	await page.waitForTimeout(STANDARD_TIMEOUT.XM_MS);

	await page.getByRole('button', { name: 'Login' }).click();

	console.log('Please solve the CAPTCHA puzzle manually. Pausing execution...');

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	await new Promise((resolve) => {
		rl.question('After login, wait until you see the "Got It" button, then press the ENTER key to resume.', () => {
			rl.close();
			resolve();
		});
	});

	console.log('Resuming execution post login...');
	await page.getByText('Got It', { exact: true }).click();

	await context.storageState({ path: PATHS.SESSION_STORAGE });
	await browser.close();
}
