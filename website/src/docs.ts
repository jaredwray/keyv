import fs from "node:fs";

const adapterOrder: Record<string, number> = {
	redis: 10,
	valkey: 11,
	postgres: 12,
	mysql: 13,
	mongo: 14,
	sqlite: 15,
	memcache: 16,
	etcd: 17,
	dynamo: 18,
	"cloudflare-kv": 19,
	bigmap: 20,
};

const compressionOrder: Record<string, number> = {
	"compress-gzip": 10,
	"compress-brotli": 11,
	"compress-lz4": 12,
};

const serializationOrder: Record<string, number> = {
	superjson: 10,
	msgpackr: 11,
};

const encryptionOrder: Record<string, number> = {
	"encrypt-node": 10,
	"encrypt-web": 11,
};

async function main() {
	const basePath = await getBasePath();

	console.log(`base path:${basePath}`);

	await copyStorageAdapters(basePath);
	await copyCompressionDocs(basePath);
	await copySerializationDocs(basePath);
	await copyEncryptionDocs(basePath);
	await copyTestSuite(basePath);
	await copyBigMap(basePath);
}

async function copyStorageAdapters(basePath: string) {
	const storagePath = `${basePath}/storage`;
	const websiteDocsPath = `${basePath}/website/site/docs/storage-adapters`;
	const storageAdapters = await fs.promises.readdir(storagePath);

	for (const storageAdapter of storageAdapters) {
		if (storageAdapter === ".DS_Store") {
			continue;
		}
		console.log(`Adding storage adapter: ${storageAdapter}`);
		await createDoc(
			storageAdapter,
			storagePath,
			websiteDocsPath,
			"Storage Adapters",
			adapterOrder[storageAdapter],
		);
	}
}

async function copyTestSuite(basePath: string) {
	const originalFileText = await fs.promises.readFile(
		`${basePath}/core/test-suite/README.md`,
		"utf8",
	);
	let newFileText = "---\n";
	newFileText += `title: 'Test Suite'\n`;
	newFileText += `sidebarTitle: 'Test Suite'\n`;
	newFileText += `order: 16\n`;
	newFileText += "---\n";
	newFileText += "\n";
	newFileText += originalFileText;

	newFileText = cleanDocumentFromImage(newFileText);

	console.log("Adding Test Suite");
	await fs.promises.writeFile(`${basePath}/website/site/docs/test-suite.md`, newFileText);
}

async function copyBigMap(basePath: string) {
	const originalFileText = await fs.promises.readFile(`${basePath}/core/bigmap/README.md`, "utf8");
	let newFileText = "---\n";
	newFileText += `title: '@keyv/bigmap'\n`;
	newFileText += `sidebarTitle: '@keyv/bigmap'\n`;
	newFileText += `parent: 'Storage Adapters'\n`;
	newFileText += `order: ${adapterOrder.bigmap}\n`;
	newFileText += "---\n";
	newFileText += "\n";
	newFileText += originalFileText;

	newFileText = cleanDocumentFromImage(newFileText);

	const websiteDocsPath = `${basePath}/website/site/docs/storage-adapters`;
	await fs.promises.mkdir(websiteDocsPath, { recursive: true });
	console.log("Adding BigMap");
	await fs.promises.writeFile(`${websiteDocsPath}/bigmap.md`, newFileText);
}

async function copyCompressionDocs(basePath: string) {
	const compressionPath = `${basePath}/compression`;
	const websiteDocsPath = `${basePath}/website/site/docs/compression`;
	const compressionAdapters = await fs.promises.readdir(compressionPath);

	for (const compressionAdapter of compressionAdapters) {
		if (compressionAdapter === ".DS_Store") {
			continue;
		}
		console.log(`Adding compression adapter: ${compressionAdapter}`);
		await createDoc(
			compressionAdapter,
			compressionPath,
			websiteDocsPath,
			"Compression",
			compressionOrder[compressionAdapter],
		);
	}
}

async function copySerializationDocs(basePath: string) {
	const serializationPath = `${basePath}/serialization`;
	const websiteDocsPath = `${basePath}/website/site/docs/serialization`;
	const serializers = await fs.promises.readdir(serializationPath);

	for (const serializer of serializers) {
		if (serializer === ".DS_Store") {
			continue;
		}
		console.log(`Adding serializer: ${serializer}`);
		await createDoc(
			serializer,
			serializationPath,
			websiteDocsPath,
			"Serialization",
			serializationOrder[serializer],
		);
	}
}

async function copyEncryptionDocs(basePath: string) {
	const encryptionPath = `${basePath}/encryption`;
	const websiteDocsPath = `${basePath}/website/site/docs/encryption`;
	const adapters = await fs.promises.readdir(encryptionPath);

	for (const adapter of adapters) {
		if (adapter === ".DS_Store") {
			continue;
		}
		console.log(`Adding encryption adapter: ${adapter}`);
		await createDoc(
			adapter,
			encryptionPath,
			websiteDocsPath,
			"Encryption",
			encryptionOrder[adapter],
		);
	}
}

function cleanDocumentFromImage(document: string) {
	document = document.replace(
		`<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>`,
		"",
	);
	document = document.replace(
		`[<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)`,
		"",
	);
	document = document.replace(
		`[<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)`,
		"",
	);
	return document;
}

async function getBasePath() {
	if (await directoryExists("core")) {
		return ".";
	}

	return "..";
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		const stats = await fs.promises.stat(path);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function createDoc(
	adapterName: string,
	path: string,
	outputPath: string,
	parent: string,
	order?: number,
) {
	const originalFileName = "README.md";
	const newFileName = `${adapterName}.md`;
	const packageJSONPath = `${path}/${adapterName}/package.json`;
	const packageJSONContent = await fs.promises.readFile(packageJSONPath);
	const packageJSON = JSON.parse(packageJSONContent.toString());
	const originalFileText = await fs.promises.readFile(
		`${path}/${adapterName}/${originalFileName}`,
		"utf8",
	);
	let newFileText = "---\n";
	newFileText += `title: '${packageJSON.name}'\n`;
	newFileText += `sidebarTitle: '${packageJSON.name}'\n`;
	newFileText += `parent: '${parent}'\n`;
	if (order !== undefined) {
		newFileText += `order: ${order}\n`;
	}
	newFileText += "---\n";
	newFileText += "\n";
	newFileText += originalFileText;

	newFileText = cleanDocumentFromImage(newFileText);

	await fs.promises.mkdir(outputPath, { recursive: true });
	await fs.promises.writeFile(`${outputPath}/${newFileName}`, newFileText);
}

main();
