import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvMemoryAdapter } from "../../src/adapters/memory.js";

// eslint-disable-next-line no-promise-executor-return
const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Keyv Generic Store Options", () => {
	test("should accept a store as the first argument", () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		expect(keyv.store).toBe(store);
		const newStore = new Map();
		keyv.store = newStore;
		expect(keyv.store).toBe(newStore);
	});

	test("should set the namespace option", () => {
		const store = new Map();
		const namespace = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace });
		expect(keyv.namespace).toBe(namespace);
	});

	test("should be able to set get the keySeparator", () => {
		const store = new Map();
		const separator = faker.string.alphanumeric(3);
		const newSeparator = faker.string.alphanumeric(3);
		const keyv = new KeyvMemoryAdapter(store, { keySeparator: separator });
		expect(keyv.keySeparator).toBe(separator);
		keyv.keySeparator = newSeparator;
		expect(keyv.keySeparator).toBe(newSeparator);
	});

	test("should be able to get the namespace from options", () => {
		const store = new Map();
		const namespace = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace });
		expect(keyv.namespace).toBe(namespace);
	});
});

describe("Keyv Generic Store Namespace", () => {
	test("should return the namespace if it is a string", () => {
		const store = new Map();
		const namespace = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace });
		expect(keyv.namespace).toBe(namespace);
	});

	test("should set the namespace", () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const namespace = faker.string.alphanumeric(8);
		keyv.namespace = namespace;
		expect(keyv.namespace).toBe(namespace);
	});

	test("should set the key prefix", () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(keyv.getKeyPrefix(key, ns)).toBe(`${ns}:${key}`);
		expect(keyv.getKeyPrefix(key)).toBe(key);
	});

	test("should get the key prefix data", () => {
		const store = new Map();
		const ns = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns });
		expect(keyv.getKeyPrefixData(`${ns}:${key}`)).toEqual({
			key,
			namespace: ns,
		});
		expect(keyv.getKeyPrefixData(key)).toEqual({
			key,
		});
	});

	test("should return full key when no namespace is configured", () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const keyWithColon = "user:123";
		expect(keyv.getKeyPrefixData(keyWithColon)).toEqual({
			key: keyWithColon,
		});
	});
});

describe("Keyv Generic set / get / has Operations", () => {
	test("should set a value", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("should set many keys", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const result = await keyv.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
		]);
		expect(await keyv.get(key1)).toBe(value1);
		expect(await keyv.get(key2)).toBe(value2);
		expect(result).toEqual([true, true]);
	});

	test("should get undefined for a non-existent key", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should handle get with a ttl and expiration", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		await keyv.set(key, { value, expires: Date.now() + 10 }, 10);
		await sleep(20);
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should handle has", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value = faker.lorem.sentence();
		await keyv.set(key1, value);
		expect(await keyv.has(key1)).toBe(true);
		expect(await keyv.has(key2)).toBe(false);
	});

	test("should return true for has with falsy stored values", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const key4 = faker.string.uuid();
		await keyv.set(key1, 0);
		await keyv.set(key2, "");
		await keyv.set(key3, false);
		await keyv.set(key4, null);
		expect(await keyv.has(key1)).toBe(true);
		expect(await keyv.has(key2)).toBe(true);
		expect(await keyv.has(key3)).toBe(true);
		expect(await keyv.has(key4)).toBe(true);
	});

	test("should return false for has with expired data", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		await keyv.set(key, { value: "test", expires: Date.now() - 1000 });
		expect(await keyv.has(key)).toBe(false);
		expect(store.has(key)).toBe(false);
	});

	test("should handle hasMany", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		await keyv.set(key1, "value1");
		await keyv.set(key2, "value2");
		const results = await keyv.hasMany([key1, key2, key3]);
		expect(results).toEqual([true, true, false]);
	});

	test("should be able to get many keys", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.uuid();
		const value3 = faker.lorem.sentence();
		const missingKey = faker.string.uuid();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);
		const values = await keyv.getMany([key1, key2, key3, missingKey]);
		expect(values[0]).toBe(value1);
		expect(values[1]).toBe(value2);
		expect(values[2]).toBe(value3);
		expect(values[3]).toBe(undefined);
	});

	test("getMany should return undefined for expired keys and remove them from the store", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		await keyv.set(key1, { value: value1, expires: Date.now() + 1 }, 1);
		await keyv.set(key2, value2);

		// Wait for key1 to expire
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		const values = await keyv.getMany([key1, key2]);
		expect(values[0]).toBe(undefined);
		expect(values[1]).toBe(value2);
		// Expired key should be deleted from the store
		expect(store.has(key1)).toBe(false);
	});
});

describe("Keyv Generic Delete / Clear Operations", () => {
	test("should delete a key", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		await keyv.delete(key);
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should clear all keys", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		await keyv.clear();
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should only clear keys in the current namespace", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns1 });
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const otherKey = faker.string.uuid();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		// Manually add a key in a different namespace
		store.set(`${ns2}:${otherKey}`, { value: "other", expires: undefined });

		await keyv.clear();

		// ns1 keys should be gone
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		// ns2 key should remain
		expect(store.has(`${ns2}:${otherKey}`)).toBe(true);
	});

	test("should clear entire store when no namespace is set", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		const otherKey = faker.string.uuid();
		await keyv.set(key, value);
		store.set(`ns2:${otherKey}`, { value: "other", expires: undefined });

		await keyv.clear();

		expect(store.size).toBe(0);
	});

	test("should delete many keys", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.uuid();
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);
		await keyv.deleteMany([key1, key2]);
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		expect(await keyv.get(key3)).toBe(value3);
	});

	test("should emit error on delete many keys", async () => {
		const store = new Map();
		store.delete = () => {
			throw new Error("delete error");
		};

		const keyv = new KeyvMemoryAdapter(store);
		let errorEmitted = false;
		keyv.on("error", (error) => {
			expect(error.message).toBe("delete error");
			errorEmitted = true;
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		await keyv.deleteMany([key1, key2]);
		expect(errorEmitted).toBe(true);
	});

	test("should use the store to set multiple keys", async () => {
		const map = new Map();
		const keyv = createKeyv(map);

		const testData = Array.from({ length: 5 }, () => ({
			key: faker.string.uuid(),
			value: faker.lorem.sentence(),
		}));

		const result = await keyv.setMany(testData);
		expect(result).toEqual([true, true, true, true, true]);
		const resultValue = await keyv.get(testData[0].key);
		expect(resultValue).toEqual(testData[0].value);
	});

	test("should emit and return false on error", async () => {
		const map = new Map();
		map.set = () => {
			throw new Error("Test Error");
		};

		const keyv = createKeyv(map);
		let errorEmitted = false;
		keyv.on("error", () => {
			errorEmitted = true;
		});

		const testData = Array.from({ length: 5 }, () => ({
			key: faker.string.uuid(),
			value: faker.lorem.sentence(),
		}));

		const result = await keyv.setMany(testData);
		expect(result).toEqual([false, false, false, false, false]);
		expect(errorEmitted).toBe(true);
	});

	test("should emit and return false on error", async () => {
		const map = new Map();
		const keyv = createKeyv(map);
		keyv.store.deleteMany = () => {
			throw new Error("Test Error");
		};

		let errorEmitted = false;
		keyv.on("error", () => {
			errorEmitted = true;
		});

		const testKeys = Array.from({ length: 5 }, () => faker.string.uuid());

		const result = await keyv.deleteMany(testKeys);
		expect(result).toEqual(testKeys.map(() => false));
		expect(errorEmitted).toBe(true);
	});

	describe("getMany", async () => {
		test("should set many items and then get them", async () => {
			const keyv = createKeyv(new Map());

			const testData = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.sentence(),
			}));

			const testKeys = testData.map((data) => data.key);

			await keyv.setMany(testData);
			const result = await keyv.getMany(testKeys);
			expect(result.length).toBe(5);
		});

		test("should set many items and then get them with get", async () => {
			const keyv = createKeyv(new Map());

			const testData = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.sentence(),
			}));

			const testKeys = testData.map((data) => data.key);

			await keyv.setMany(testData);
			const result = await keyv.get(testKeys);
			expect(result.length).toBe(5);
		});

		test("should set many items and then get them raw", async () => {
			const keyv = createKeyv(new Map());

			const testData = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.sentence(),
			}));

			const testKeys = testData.map((data) => data.key);

			await keyv.setMany(testData);
			const result = await keyv.getManyRaw(testKeys);
			expect(result.length).toBe(5);
			expect(result[0]?.value).toBe(testData[0].value);
		});
	});

	describe("hasMany", async () => {
		test("should set many items and then check if they exist", async () => {
			const keyv = createKeyv(new Map());

			const testData = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.sentence(),
			}));

			const testKeys = testData.map((data) => data.key);

			await keyv.setMany(testData);
			const result = await keyv.hasMany(testKeys);
			expect(result.length).toBe(5);
		});

		test("should use the store hasMany function", async () => {
			const map = new Map();
			const keyv = createKeyv(map);
			keyv.store.hasMany = async () => [true, true, true, true, true];

			const testData = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.sentence(),
			}));

			const testKeys = testData.map((data) => data.key);

			await keyv.setMany(testData);
			const result = await keyv.has(testKeys);
			expect(result.length).toBe(5);
		});

		test("should be able to get less on hasMany", async () => {
			const testData = Array.from({ length: 5 }, () => ({
				key: faker.string.uuid(),
				value: faker.lorem.sentence(),
			}));

			const testKeys = testData.map((data) => data.key);

			const keyv = createKeyv(new Map());
			await keyv.setMany(testData);
			const resultList = await keyv.hasMany(testKeys);
			expect(resultList.length).toBe(5);
			const deleteResult = await keyv.delete(testData[0].key);
			expect(deleteResult).toBe(true);
			const result = await keyv.hasMany(testKeys);
			expect(result.length).toBe(5);
			expect(result[0]).toBe(false);
		});
	});
});

describe("createKeyv namespace forwarding", () => {
	test("should prefix keys with namespace when using createKeyv", async () => {
		const store = new Map();
		const ns = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		const keyv = createKeyv(store, { namespace: ns });
		await keyv.set(key, value);
		expect(store.has(`${ns}:${key}`)).toBe(true);
		expect(store.has(key)).toBe(false);
		expect(await keyv.get(key)).toBe(value);
	});

	test("should isolate namespaces when using createKeyv", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		const kv1 = createKeyv(store, { namespace: ns1 });
		const kv2 = createKeyv(store, { namespace: ns2 });
		await kv1.set(key, value1);
		await kv2.set(key, value2);
		expect(await kv1.get(key)).toBe(value1);
		expect(await kv2.get(key)).toBe(value2);
	});
});

describe("Keyv Generic Store Iterator", () => {
	test("should iterate over all entries", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.uuid();
		const value3 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(3);
		expect(entries.map(([key]) => key).sort()).toEqual([key1, key2, key3].sort());
	});

	test("should filter by namespace", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns1 });

		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.uuid();
		const value3 = faker.lorem.sentence();

		// Set entries with different namespaces manually
		store.set(`${ns1}:${key1}`, { value: value1, expires: undefined });
		store.set(`${ns1}:${key2}`, { value: value2, expires: undefined });
		store.set(`${ns2}:${key3}`, { value: value3, expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual([key1, key2].sort());
	});

	test("should skip expired entries and delete them", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);

		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();

		// Set a valid entry
		await keyv.set(key1, value1);

		// Set an expired entry manually
		store.set(key2, { value: value2, expires: Date.now() - 1000 });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe(key1);

		// Verify expired entry was deleted
		expect(store.has(key2)).toBe(false);
	});

	test("should return empty iterator when store does not support entries", async () => {
		const customStore = {
			get: (_key: string) => undefined,
			set: (_key: string, _value: unknown) => {},
			delete: (_key: string) => true,
			clear: () => {},
			has: (_key: string) => false,
		};

		const keyv = new KeyvMemoryAdapter(customStore);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(0);
	});

	test("should strip namespace prefix from keys when iterating with namespace", async () => {
		const store = new Map();
		const ns = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns });

		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		// Keys should not have namespace prefix
		expect(entries.map(([key]) => key).sort()).toEqual([key1, key2].sort());
	});

	test("should work with custom key separator", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, {
			namespace: ns1,
			keySeparator: ":",
		});

		const key1 = faker.string.uuid();
		const value1 = faker.lorem.sentence();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.sentence();
		const key3 = faker.string.uuid();
		const value3 = faker.lorem.sentence();

		// Set entries with custom separator manually
		store.set(`${ns1}:${key1}`, { value: value1, expires: undefined });
		store.set(`${ns1}:${key2}`, { value: value2, expires: undefined });
		store.set(`${ns2}:${key3}`, { value: value3, expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual([key1, key2].sort());
	});
});
