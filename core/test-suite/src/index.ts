import type KeyvModule from "keyv";
import { keyvApiTests } from "./api.js";
import { keyvNamespaceTests } from "./namespace.js";
import { storageBasicTests } from "./storage-basic.js";
import { storageBatchTests } from "./storage-batch.js";
import { storageDisconnectTests } from "./storage-disconnect.js";
import { storageIteratorTests } from "./storage-iterator.js";
import { storageNamespaceTests } from "./storage-namespace.js";
import { storageTtlTests } from "./storage-ttl.js";
import type { KeyvStoreFn, StorageFn, StorageTestOptions, TestFunction } from "./types.js";
import { keyvValueTests } from "./values.js";

/**
 * Runs the full Keyv-wrapper test suite: API, value types, and namespace tests.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param Keyv - The Keyv constructor
 * @param store - Factory that returns a fresh store instance per test
 */
const keyvTestSuite = (test: TestFunction, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamespaceTests(test, Keyv, store);
};

/**
 * Runs the full storage adapter test suite: basic CRUD, batch, iterator, TTL, namespace, and disconnect.
 * Individual test groups can be toggled off via {@link StorageTestOptions}.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param store - Factory that returns a fresh {@link KeyvStorageAdapter} instance per test
 * @param options - Configuration for missing value behavior and test group toggles
 */
const storageTestSuite = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	storageBasicTests(test, store, options);
	storageBatchTests(test, store, options);
	storageIteratorTests(test, store, options);
	storageTtlTests(test, store, options);
	storageNamespaceTests(test, store, options);
	storageDisconnectTests(test, store, options);
};

export { keyvTestSuite, storageTestSuite };
export { keyvApiTests } from "./api.js";
export { compressionTestSuite } from "./compression.js";
export { encryptionTestSuite } from "./encryption.js";
export { delay, delay as sleep } from "./helper.js";
export { keyvIteratorTests } from "./iterator.js";
export { keyvNamespaceTests } from "./namespace.js";
export { serializationTestSuite } from "./serialization.js";
export { storageBasicTests } from "./storage-basic.js";
export { storageBatchTests } from "./storage-batch.js";
export { storageDisconnectTests } from "./storage-disconnect.js";
export { storageIteratorTests } from "./storage-iterator.js";
export { storageNamespaceTests } from "./storage-namespace.js";
export { storageTtlTests } from "./storage-ttl.js";
export type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";
export { keyvValueTests } from "./values.js";
