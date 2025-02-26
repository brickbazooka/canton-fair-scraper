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

export function getTimeDifference(startTime, endTime) {
	const timeDifference = endTime - startTime;
	const hours = Math.floor(timeDifference / 3600000);
	const minutes = Math.floor((timeDifference % 3600000) / 60000);
	const seconds = Math.floor((timeDifference % 60000) / 1000);
	return { hours, minutes, seconds };
}

export function withTimer(fn) {
	return async function (...args) {
		const startTime = Date.now();
		console.log(`TIME: ${new Date(startTime).toLocaleTimeString()}`);

		const result = await fn(...args);

		const endTime = Date.now();
		const { hours, minutes, seconds } = getTimeDifference(startTime, endTime);

		console.log('\n***\n');
		console.log(`TIME: ${new Date(endTime).toLocaleTimeString()}`);
		console.log(
			`Total time elapsed: ${hours > 0 ? `${hours}h ` : ''}${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`
		);

		return result;
	};
}

export function logScrapingError(error, type) {
	const pluralizedType = type === 'category' ? 'categories' : `${type}s`;
	console.log('\n***\n');
	console.error(`An error occurred while scraping ${pluralizedType}:`, error);
	console.log('\n***\n');
}
