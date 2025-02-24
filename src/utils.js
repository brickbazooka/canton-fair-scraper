import fs from 'fs';

export function appendToJSONArrFile(filePath, data) {
	let existingData = [];
	if (fs.existsSync(filePath)) {
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		existingData = JSON.parse(fileContent);
	}
	existingData.push(data);
	fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}

export function appendToJSONObjFile(filePath, data) {
	let existingData = {};
	if (fs.existsSync(filePath)) {
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		existingData = JSON.parse(fileContent);
	}
	const newData = { ...existingData, ...data };
	fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
}
