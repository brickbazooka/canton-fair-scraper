import fs from 'fs';
import path from 'path';

export function appendToJSONArrFile(filePath, data) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	let existingData = [];
	if (fs.existsSync(filePath)) {
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		existingData = JSON.parse(fileContent);
	}
	existingData.push(data);
	fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}

export function appendToJSONObjFile(filePath, data) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	let existingData = {};
	if (fs.existsSync(filePath)) {
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		existingData = JSON.parse(fileContent);
	}
	existingData = { ...existingData, ...data };
	fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}

function getTimeStr(time) {
	return `TIME: ${new Date(time).toLocaleTimeString()}`;
}

function getTimeDifference(startTime, endTime) {
	const timeDifference = endTime - startTime;
	const hours = Math.floor(timeDifference / 3600000);
	const minutes = Math.floor((timeDifference % 3600000) / 60000);
	const seconds = Math.floor((timeDifference % 60000) / 1000);
	return { hours, minutes, seconds };
}

function getTimeElapsedStr({ hours, minutes, seconds }) {
	return `Total time elapsed: ${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;
}

export function withTimer(fn) {
	return async function decoratedWithTimer(...args) {
		const startTime = Date.now();
		console.log(getTimeStr(startTime));

		// Store the start time in a global variable to access it in other loggers
		global.processStartTime = startTime;

		const result = await fn(...args);

		const endTime = Date.now();
		const { hours, minutes, seconds } = getTimeDifference(startTime, endTime);

		console.log('\n***\n');
		console.log(getTimeStr(endTime));
		console.log(getTimeElapsedStr({ hours, minutes, seconds }));

		return result;
	};
}

export function logScrapingError(error, scrapingTargetType) {
	let timeElapesedStr = '';
	if (global.processStartTime) {
		const endTime = Date.now();
		const { hours, minutes, seconds } = getTimeDifference(global.processStartTime, endTime);
		timeElapesedStr = getTimeElapsedStr({ hours, minutes, seconds });
	}

	const pluralizedScrapingTargetType = scrapingTargetType === 'category' ? 'categories' : `${scrapingTargetType}s`;

	console.log('\n***\n');
	if (timeElapesedStr) {
		console.log(timeElapesedStr);
	}
	console.error(`An error occurred while scraping ${pluralizedScrapingTargetType}:`, error);
	console.log('\n***\n');
}
