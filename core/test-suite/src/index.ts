import type KeyvModule from "keyv";
import keyvApiTests from "./api.js";
import keyvNamespaceTest from "./namespace.js";
import storageBasicTests from "./storage-basic.js";
import storageBatchTests from "./storage-batch.js";
import type { KeyvStoreFn, StorageFn, StorageTestOptions, TestFunction } from "./types.js";
import keyvValueTests from "./values.js";

const keyvTestSuite = (test: TestFunction, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamespaceTest(test, Keyv, store);
};

/* v8 ignore next 4 -- @preserve */
const storageTestSuite = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	storageBasicTests(test, store, options);
	storageBatchTests(test, store, options);
};

export default keyvTestSuite;
export { storageTestSuite };

export { default as keyvApiTests } from "./api.js";
export { default as keyvCompressionTests } from "./compression.js";
export { delay, delay as sleep } from "./helper.js";
export { default as keyvIteratorTests } from "./iterator.js";
export { default as keyvNamespaceTest } from "./namespace.js";
export { default as storageBasicTests } from "./storage-basic.js";
export { default as storageBatchTests } from "./storage-batch.js";
export { default as storageDisconnectTests } from "./storage-disconnect.js";
export { default as storageIteratorTests } from "./storage-iterator.js";
export { default as storageNamespaceTests } from "./storage-namespace.js";
export { default as storageTtlTests } from "./storage-ttl.js";
export type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";
export { default as keyvValueTests } from "./values.js";
