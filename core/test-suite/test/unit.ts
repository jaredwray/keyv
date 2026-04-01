import Keyv, { KeyvJsonSerializer, KeyvMemoryAdapter } from "keyv";
import { it } from "vitest";
import { KeyvLz4TestAdapter } from "../src/compression-adapter.js";
import { KeyvAes256TestAdapter } from "../src/encryption-adapter.js";
import {
	compressionTestSuite,
	encryptionTestSuite,
	keyvIteratorTests,
	keyvTestSuite,
	serializationTestSuite,
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

// Serialization tests using built-in JSON serializer
serializationTestSuite(it, new KeyvJsonSerializer());

// Encryption tests using AES-256-GCM test adapter
encryptionTestSuite(it, new KeyvAes256TestAdapter("test-secret-key"));
