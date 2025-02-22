import {
	CANTON_FAIR_URL,
	CANTON_FAIR_USERTYPE,
	CANTON_FAIR_USERNAME,
	CANTON_FAIR_EMAIL,
	CANTON_FAIR_PASSWORD,
	STANDARD_TIMEOUT,
} from './constants.js';

async function isLoggedIn(page) {
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

export async function logInToCantonFair(page) {
	await page.goto(CANTON_FAIR_URL);
	await page.waitForLoadState('domcontentloaded');

	if (await isLoggedIn(page)) {
		console.log('Already logged in. Skipping login process.');
		return;
	}

	await page.getByText('Login').click();
	await page.waitForLoadState('load');

	await page.getByText(CANTON_FAIR_USERTYPE).click();
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

	console.log('Solve the CAPTCHA puzzle manually. Wait until you see the "Got It" button...');
	await page.pause(); // Wait for manual CAPTCHA solving

	console.log('Resuming automation post CAPTCHA completion...');
	await page.getByText('Got It', { exact: true }).click();
}
