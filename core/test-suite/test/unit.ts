import Keyv, { KeyvMemoryAdapter } from "keyv";
import { it } from "vitest";
import { KeyvLz4TestAdapter } from "../src/compression-adapter.js";
import {
	compressionTestSuite,
	keyvIteratorTests,
	keyvTestSuite,
	storageTestSuite,
} from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {}

	return new MapExtend();
};

keyvTestSuite(it, Keyv, storeExtended);
keyvIteratorTests(it, Keyv, storeExtended);
compressionTestSuite(it, new KeyvLz4TestAdapter());

// Storage-level tests using KeyvMemoryAdapter
const memoryStore = () => new KeyvMemoryAdapter(new Map());
storageTestSuite(it, memoryStore);
