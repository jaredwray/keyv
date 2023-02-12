import * as fs from "fs-extra";

async function main() {
  await copyGettingStarted();
  await copyCachingDocs();
  await copyStorageAdapters();
};

async function copyGettingStarted() {
  await fs.copy("../../docs/getting-started/index.md", "site/docs/index.md");
}

async function copyCachingDocs() {
    await fs.copy("../../docs/caching/", "site/docs/caching");
}

async function copyStorageAdapters() {
    const storageAdapters = await fs.readdir("../../packages");
    for (const storageAdapter of storageAdapters) {
        if((storageAdapter.startsWith("website") || storageAdapter.startsWith("keyv")) !== true ) {
            console.log("../../packages/" + storageAdapter + "/readme.md");
            await fs.copy("../../packages/" + storageAdapter + "/readme.md", "site/docs/storage-adapters/" + storageAdapter + ".md");
        }
    };
}

main();