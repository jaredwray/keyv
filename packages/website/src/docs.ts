import * as fs from "fs-extra";
import os from "os";

async function main() {

    console.log("packages path:" + getRelativePackagePath());
    console.log("docs path:" + getRelativeDocsPath());

    await copyGettingStarted();
    await copyCachingDocs();
    await copyStorageAdapters();
    await copyCompressionDocs();
    await copyTestSuite();
};

async function copyGettingStarted() {
    const docsPath = getRelativeDocsPath();
    const packagesPath = getRelativePackagePath();
    const originalFileText = await fs.readFile(`${docsPath}/getting-started/index.md`, "utf8");
    let newFileText = "---\n";
    newFileText += `title: 'Getting Started Guide'\n`;
    newFileText += `permalink: /docs/\n`;
    newFileText += `order: 0` + os.EOL;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    console.log("Adding Getting Started Guide");
    await fs.writeFile(`${packagesPath}/website/site/docs/index.md`, newFileText);
}

async function copyCachingDocs() {
    const docsPath = getRelativeDocsPath();
    const packagesPath = getRelativePackagePath();
    console.log("Adding Caching Docs");
    await fs.copy(`${docsPath}/caching/`, `${packagesPath}/website/site/docs/caching`);
}

async function copyStorageAdapters() {
    const packagesPath = getRelativePackagePath();
    const storageAdapters = await fs.readdir(`${packagesPath}`);
    const filterList = ["keyv", "website", "compress-brotli", "compress-gzip", "test-suite"];

    for (const storageAdapter of storageAdapters) {
        if((filterList.indexOf(storageAdapter) > -1) !== true ) {
            console.log("Adding storage adapter: " + storageAdapter);
            await createDoc(storageAdapter, `${packagesPath}`, `${packagesPath}/website/site/docs/storage-adapters`, "Storage Adapters");
        }
    };
}

async function copyTestSuite() {
    const packagesPath = getRelativePackagePath();
    const originalFileText = await fs.readFile(`${packagesPath}/test-suite/README.md`, "utf8");
    let newFileText = "---\n";
    newFileText += `title: 'Test Suite'\n`;
    newFileText += `permalink: /docs/test-suite/\n`;
    newFileText += `order: 4` + os.EOL;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    newFileText = cleanDocumentFromImage(newFileText);

    console.log("Adding Test Suite");
    await fs.writeFile(`${packagesPath}/website/site/docs/test-suite/index.md`, newFileText);
}

async function copyCompressionDocs() {
    const packagesPath = getRelativePackagePath();
    const compressionAdapters = await fs.readdir(`${packagesPath}`);
    for(const compressionAdapter of compressionAdapters) {
        if(compressionAdapter.startsWith("compress-")) {
            console.log("Adding compression adapter: " + compressionAdapter);
            await createDoc(compressionAdapter, `${packagesPath}`, `${packagesPath}/website/site/docs/compression`, "Compression");
        }
    }
}

function cleanDocumentFromImage(document: string) {
    document = document.replace(`[<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)`, "");
    return document;
};

function getRelativePackagePath() {
    if(fs.pathExistsSync("packages")) {
        //we are in the root
        return "packages";
    }

    //we are in the website folder
    return "../../packages"
}

function getRelativeDocsPath() {
    if(fs.pathExistsSync("docs")) {
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