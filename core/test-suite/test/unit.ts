import Keyv, { KeyvMemoryAdapter } from "keyv";
import { it } from "vitest";
import { KeyvLz4TestAdapter } from "../src/compression-adapter.js";
import keyvTestSuite, {
	keyvCompressionTests,
	keyvIteratorTests,
	storageBasicTests,
	storageBatchTests,
	storageDisconnectTests,
	storageIteratorTests,
	storageNamespaceTests,
	storageTtlTests,
} from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {}

	return new MapExtend();
};

keyvTestSuite(it, Keyv, storeExtended);
keyvIteratorTests(it, Keyv, storeExtended);
keyvCompressionTests(it, new KeyvLz4TestAdapter());

// Storage-level tests using KeyvMemoryAdapter
const memoryStore = () => new KeyvMemoryAdapter(new Map());

storageBasicTests(it, memoryStore);
storageBatchTests(it, memoryStore);
storageIteratorTests(it, memoryStore);
storageTtlTests(it, memoryStore);
storageNamespaceTests(it, memoryStore);
storageDisconnectTests(it, memoryStore);
