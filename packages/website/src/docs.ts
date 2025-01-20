import fs from "node:fs";

async function main() {

    console.log("packages path:" + await getRelativePackagePath());
    console.log("docs path:" + await getRelativeDocsPath());

    await copyStorageAdapters();
    await copyCompressionDocs();
    await copyTestSuite();
    await copyKeyvAPI();
};

async function copyStorageAdapters() {
    const packagesPath = await getRelativePackagePath();
    const storageAdapters = await fs.promises.readdir(`${packagesPath}`);
    const filterList = ["keyv", "website", "compress-brotli", "compress-gzip", "compress-lz4", "test-suite", ".DS_Store", "serialize", "third-party"];

    for (const storageAdapter of storageAdapters) {
        if((filterList.indexOf(storageAdapter) > -1) !== true ) {
            console.log("Adding storage adapter: " + storageAdapter);
            await createDoc(storageAdapter, `${packagesPath}`, `${packagesPath}/website/site/docs/storage-adapters`, "Storage Adapters");
        }
    };
}

async function copyTestSuite() {
    const packagesPath = await getRelativePackagePath();
    const originalFileText = await fs.promises.readFile(`${packagesPath}/test-suite/README.md`, "utf8");
    let newFileText = "---\n";
    newFileText += `title: 'Test Suite'\n`;
    newFileText += `permalink: /docs/test-suite/\n`;
    newFileText += `order: 6\n`;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    newFileText = cleanDocumentFromImage(newFileText);

    console.log("Adding Test Suite");
    await fs.promises.writeFile(`${packagesPath}/website/site/docs/test-suite.md`, newFileText);
}

async function copyKeyvAPI() {
    const packagesPath = await getRelativePackagePath();
    const originalFileText = await fs.promises.readFile(`${packagesPath}/keyv/README.md`, "utf8");
    let newFileText = "---\n";
    newFileText += `title: 'Keyv API'\n`;
    newFileText += `order: 3\n`;
    newFileText += "---\n";
    newFileText += "\n";
    newFileText += originalFileText;

    newFileText = cleanDocumentFromImage(newFileText);

    console.log("Adding Keyv API");
    await fs.promises.writeFile(`${packagesPath}/website/site/docs/keyv.md`, newFileText);
}

async function copyCompressionDocs() {
    const packagesPath = await getRelativePackagePath();
    const compressionAdapters = await fs.promises.readdir(`${packagesPath}`);
    for(const compressionAdapter of compressionAdapters) {
        if(compressionAdapter.startsWith("compress-")) {
            console.log("Adding compression adapter: " + compressionAdapter);
            await createDoc(compressionAdapter, `${packagesPath}`, `${packagesPath}/website/site/docs/compression`, "Compression");
        }
    }
}

function cleanDocumentFromImage(document: string) {
    document = document.replace(`<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>`, "");
    document = document.replace(`[<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)`, "");
    document = document.replace(`[<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)`, "");
    return document;
};

async function getRelativePackagePath() {
    if(await directoryExists("packages")) {
        //we are in the root
        return "packages";
    }

    //we are in the website folder
    return "../../packages"
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