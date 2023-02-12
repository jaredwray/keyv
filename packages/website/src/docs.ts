import * as fs from "fs-extra";

async function main() {
  await copyGettingStarted();
  await copyCachingDocs();
  await copyStorageAdapters();
  await copyCompressionDocs();
  await copyTestSuite();
};

async function copyGettingStarted() {
    const originalFileText = await fs.readFile("../../docs/getting-started/index.md", "utf8");
    let newFileText = "---\n";
    newFileText += `title: 'Getting Started Guide'\n`;
    newFileText += `permalink: /docs/\n`;
    newFileText += `order: 0\n`;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    await fs.writeFile("site/docs/index.md", newFileText);
}

async function copyCachingDocs() {
    await fs.copy("../../docs/caching/", "site/docs/caching");
}

async function copyStorageAdapters() {
    const storageAdapters = await fs.readdir("../../packages");
    const filterList = ["keyv", "website", "compress-brotli", "compress-gzip", "test-suite"];

    for (const storageAdapter of storageAdapters) {
        if((filterList.indexOf(storageAdapter) > -1) !== true ) {
            console.log("Adding storage adapter: " + storageAdapter);
            await createDoc(storageAdapter, "../../packages", "site/docs/storage-adapters", "Storage Adapters");
        }
    };
}

async function copyTestSuite() {
    const originalFileText = await fs.readFile("../../packages/test-suite/readme.md", "utf8");
    let newFileText = "---\n";
    newFileText += `title: 'Test Suite'\n`;
    newFileText += `permalink: /docs/test-suite/\n`;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    newFileText = cleanDocumentFromImage(newFileText);

    await fs.writeFile("site/docs/test-suite/index.md", newFileText);
}

async function copyCompressionDocs() {
    const compressionAdapters = await fs.readdir("../../packages");
    for(const compressionAdapter of compressionAdapters) {
        if(compressionAdapter.startsWith("compress-")) {
            console.log("Adding compression adapter: " + compressionAdapter);
            await createDoc(compressionAdapter, "../../packages", "site/docs/compression", "Compression");
        }
    }
}

function cleanDocumentFromImage(document: string) {
    document = document.replace(`[<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)`, "");
    return document;
};

async function createDoc(adapterName: string, path: string, outputPath: string, parent:string) {
    const originalFileName = "readme.md";
    const newFileName = `${adapterName}.md`;
    const packageJSONPath = `${path}/${adapterName}/package.json`;
    const packageJSON = await fs.readJSON(packageJSONPath);
    const originalFileText = await fs.readFile(`${path}/${adapterName}/${originalFileName}`, "utf8");
    let newFileText = "---\n";
    newFileText += `title: '${packageJSON.name}'\n`;
    newFileText += `sidebarTitle: '${packageJSON.name}'\n`;
    newFileText += `parent: '${parent}'\n`;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    newFileText = cleanDocumentFromImage(newFileText);

    await fs.writeFile(`${outputPath}/${newFileName}`, newFileText);
}

main();