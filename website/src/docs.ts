import fs from "node:fs";

async function main() {
	const basePath = await getBasePath();

	console.log("base path:" + basePath);
	console.log("docs path:" + await getRelativeDocsPath());

	await copyStorageAdapters(basePath);
	await copyCompressionDocs(basePath);
	await copyTestSuite(basePath);
	await copyKeyvAPI(basePath);
};

async function copyStorageAdapters(basePath: string) {
	const storagePath = `${basePath}/storage`;
	const websiteDocsPath = `${basePath}/website/site/docs/storage-adapters`;
	const storageAdapters = await fs.promises.readdir(storagePath);

	for (const storageAdapter of storageAdapters) {
		if(storageAdapter === ".DS_Store") {
			continue;
		}
		console.log("Adding storage adapter: " + storageAdapter);
		await createDoc(storageAdapter, storagePath, websiteDocsPath, "Storage Adapters");
	};
}

async function copyTestSuite(basePath: string) {
	const originalFileText = await fs.promises.readFile(`${basePath}/core/test-suite/README.md`, "utf8");
	let newFileText = "---\n";
	newFileText += `title: 'Test Suite'\n`;
	newFileText += `permalink: /docs/test-suite/\n`;
	newFileText += `order: 6\n`;
	newFileText += "---\n";
	newFileText += "\n";
	newFileText += originalFileText;

	newFileText = cleanDocumentFromImage(newFileText);

	console.log("Adding Test Suite");
	await fs.promises.writeFile(`${basePath}/website/site/docs/test-suite.md`, newFileText);
}

async function copyKeyvAPI(basePath: string) {
	const originalFileText = await fs.promises.readFile(`${basePath}/core/keyv/README.md`, "utf8");
	let newFileText = "---\n";
	newFileText += `title: 'Keyv API'\n`;
	newFileText += `order: 3\n`;
	newFileText += "---\n";
	newFileText += "\n";
	newFileText += originalFileText;

	newFileText = cleanDocumentFromImage(newFileText);

	console.log("Adding Keyv API");
	await fs.promises.writeFile(`${basePath}/website/site/docs/keyv.md`, newFileText);
}

async function copyCompressionDocs(basePath: string) {
	const compressionPath = `${basePath}/compression`;
	const websiteDocsPath = `${basePath}/website/site/docs/compression`;
	const compressionAdapters = await fs.promises.readdir(compressionPath);

	for(const compressionAdapter of compressionAdapters) {
		if(compressionAdapter === ".DS_Store") {
			continue;
		}
		console.log("Adding compression adapter: " + compressionAdapter);
		await createDoc(compressionAdapter, compressionPath, websiteDocsPath, "Compression");
	}
}

function cleanDocumentFromImage(document: string) {
	document = document.replace(`<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>`, "");
	document = document.replace(`[<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)`, "");
	document = document.replace(`[<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)`, "");
	return document;
};

async function getBasePath() {
	if(await directoryExists("core")) {
		//we are in the root
		return ".";
	}

	//we are in the website folder
	return ".."
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		const stats = await fs.promises.stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function getRelativeDocsPath() {
	if(await directoryExists("docs")) {
		//we are in the root
		return "docs";
	}

	//we are in the website folder
	return "../../docs"
}

async function createDoc(adapterName: string, path: string, outputPath: string, parent:string) {
	const originalFileName = "README.md";
	const newFileName = `${adapterName}.md`;
	const packageJSONPath = `${path}/${adapterName}/package.json`;
	const packageJSONContent = await fs.promises.readFile(packageJSONPath);
	const packageJSON = JSON.parse(packageJSONContent.toString());
	const originalFileText = await fs.promises.readFile(`${path}/${adapterName}/${originalFileName}`, "utf8");
	let newFileText = "---\n";
	newFileText += `title: '${packageJSON.name}'\n`;
	newFileText += `sidebarTitle: '${packageJSON.name}'\n`;
	newFileText += `parent: '${parent}'\n`;
	newFileText += "---\n";
	newFileText += "\n";
	newFileText += originalFileText;

	newFileText = cleanDocumentFromImage(newFileText);

	await fs.promises.mkdir(outputPath, {recursive: true});
	await fs.promises.writeFile(`${outputPath}/${newFileName}`, newFileText);
}

main();
