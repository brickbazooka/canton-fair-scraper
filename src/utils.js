import fs from 'fs';

export function appendToJSONFile(filePath, data) {
	let existingData = [];
	if (fs.existsSync(filePath)) {
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		existingData = JSON.parse(fileContent);
	}
	existingData.push(data);
	fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
}
