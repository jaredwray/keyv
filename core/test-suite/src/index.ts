import type KeyvModule from "keyv";
import { keyvApiTests } from "./api.js";
import { keyvNamespaceTests } from "./namespace.js";
import { storageBasicTests } from "./storage-basic.js";
import { storageBatchTests } from "./storage-batch.js";
import type { KeyvStoreFn, StorageFn, StorageTestOptions, TestFunction } from "./types.js";
import { keyvValueTests } from "./values.js";

const keyvTestSuite = (test: TestFunction, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamespaceTests(test, Keyv, store);
};

/* v8 ignore next 4 -- @preserve */
const storageTestSuite = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	storageBasicTests(test, store, options);
	storageBatchTests(test, store, options);
};

export { keyvTestSuite, storageTestSuite };

export { keyvApiTests } from "./api.js";
export { compressionTestSuite } from "./compression.js";
export { delay, delay as sleep } from "./helper.js";
export { keyvIteratorTests } from "./iterator.js";
export { keyvNamespaceTests } from "./namespace.js";
export { storageBasicTests } from "./storage-basic.js";
export { storageBatchTests } from "./storage-batch.js";
export { storageDisconnectTests } from "./storage-disconnect.js";
export { storageIteratorTests } from "./storage-iterator.js";
export { storageNamespaceTests } from "./storage-namespace.js";
export { storageTtlTests } from "./storage-ttl.js";
export type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";
export { keyvValueTests } from "./values.js";
