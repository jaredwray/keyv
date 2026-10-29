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
	storageTtlTests,
	type TestFunction,
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

it("storageTestSuite with batch: false registers no batch tests", (t) => {
	const names: string[] = [];
	const record: TestFunction = (name) => {
		names.push(name);
	};
	storageTestSuite(record, memoryStore, { batch: false });
	t.expect(names.filter((name) => /setMany|getMany|hasMany|deleteMany/.test(name))).toEqual([]);
	t.expect(names).toContain("set(key, value, expires) expires after the deadline");
	t.expect(names).toContain("delete(key) returns false for expired key");
});

// TTL tests at second granularity (used by stores like etcd and DynamoDB)
storageTtlTests(it, memoryStore, { ttlGranularity: "seconds" });

// Serialization tests using built-in JSON serializer
serializationTestSuite(it, new KeyvJsonSerializer());

// Encryption tests using AES-256-GCM test adapter
encryptionTestSuite(it, new KeyvAes256TestAdapter("test-secret-key"));
