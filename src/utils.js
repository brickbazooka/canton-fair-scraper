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

export function getTimeDifference(startTime, endTime) {
	const timeDifference = endTime - startTime;
	const hours = Math.floor(timeDifference / 3600000);
	const minutes = Math.floor((timeDifference % 3600000) / 60000);
	const seconds = Math.floor((timeDifference % 60000) / 1000);
	return { hours, minutes, seconds };
}
