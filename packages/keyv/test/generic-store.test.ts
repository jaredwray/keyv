import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvGenericStore } from "../src/generic-store.js";

// eslint-disable-next-line no-promise-executor-return
const sleep = async (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

describe("Keyv Generic Store Options", () => {
	test("should accept a store as the first argument", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.store).toBe(store);
		const newStore = new Map();
		keyv.store = newStore;
		expect(keyv.store).toBe(newStore);
	});

	test("should set the namespace option", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, { namespace: "test" });
		expect(keyv.namespace).toBe("test");
	});

	test("should be able to set get the keySeparator", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, { keySeparator: "test" });
		expect(keyv.keySeparator).toBe("test");
		keyv.keySeparator = "new";
		expect(keyv.keySeparator).toBe("new");
	});

	test("should be able to get the options", () => {
		const store = new Map();
		const options = { namespace: "test" };
		const keyv = new KeyvGenericStore(store, options);
		expect(keyv.opts).toEqual(options);
	});
});

describe("Keyv Generic Store Namespace", () => {
	test("should return the namespace if it is a string", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, { namespace: "test" });
		expect(keyv.getNamespace()).toBe("test");
	});

	test("should return the namespace if it is a function", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, { namespace: () => "test" });
		expect(keyv.getNamespace()).toBe("test");
	});

	test("should set the namespace", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		keyv.namespace = "test";
		expect(keyv.namespace).toBe("test");
	});

	test("should set the namespace as a function", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.namespace).toBe(undefined);
		keyv.setNamespace(() => "test");
		expect(keyv.namespace).toBe("test");
	});

	test("should set the key prefix", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.getKeyPrefix("key1", "ns1")).toBe("ns1::key1");
		expect(keyv.getKeyPrefix("key1")).toBe("key1");
	});

	test("should get the key prefix data", () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(keyv.getKeyPrefixData("ns1::key1")).toEqual({
			key: "key1",
			namespace: "ns1",
		});
		expect(keyv.getKeyPrefixData("key1")).toEqual({
			key: "key1",
			namespace: undefined,
		});
	});
});

describe("Keyv Generic set / get / has Operations", () => {
	test("should set a value", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set many keys", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		const result = await keyv.setMany([
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
		]);
		expect(await keyv.get("key1")).toStrictEqual({
			expires: undefined,
			value: "value1",
		});
		expect(await keyv.get("key2")).toStrictEqual({
			expires: undefined,
			value: "value2",
		});
		expect(result).toBeUndefined();
	});

	test("should get undefined for a non-existent key", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should handle get with a ttl and expiration", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", { val: "value1" }, 10);
		await sleep(20);
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should handle has", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		expect(await keyv.has("key1")).toBe(true);
		expect(await keyv.has("key2")).toBe(false);
	});

	test("should be able to get many keys", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		const values = await keyv.getMany(["key1", "key2", "key3", "key4"]);
		expect(values[0]).toStrictEqual({ value: "value1", expires: undefined });
		expect(values[1]).toStrictEqual({ value: "value2", expires: undefined });
		expect(values[2]).toStrictEqual({ value: "value3", expires: undefined });
		expect(values[3]).toBe(undefined);
	});
});

describe("Keyv Generic Delete / Clear Operations", () => {
	test("should delete a key", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		await keyv.delete("key1");
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should clear all keys", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		await keyv.clear();
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should delete many keys", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});

	test("should emit error on delete many keys", async () => {
		const store = new Map();
		store.delete = () => {
			throw new Error("delete error");
		};

		const keyv = new KeyvGenericStore(store);
		let errorEmitted = false;
		keyv.on("error", (error) => {
			expect(error.message).toBe("delete error");
			errorEmitted = true;
		});
		await keyv.deleteMany(["key1", "key2"]);
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
		// KeyvStoreAdapter.setMany returns Promise<void> which makes it impossible to return an array of booleans
		// from Keyv.setMany, either it needs to be allowed to return void or KeyvStoreAdapter.setMany needs to be changed
		// expect(result).toEqual([true, true, true, true, true]);
		expect(result).toBeUndefined();
		const resultValue = await keyv.get(testData[0].key);
		expect(resultValue.value).toEqual(testData[0].value);
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
		expect(result).toEqual(false);
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
			const result = await keyv.getMany(testKeys, { raw: true });
			expect(result.length).toBe(5);
			expect(result[0]?.value.value).toBe(testData[0].value);
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

describe("Keyv Generic Store Iterator", () => {
	test("should iterate over all entries", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(3);
		expect(entries.map(([key]) => key).sort()).toEqual([
			"key1",
			"key2",
			"key3",
		]);
	});

	test("should filter by namespace", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);

		// Set entries with different namespaces manually
		store.set("ns1::key1", { value: "value1", expires: undefined });
		store.set("ns1::key2", { value: "value2", expires: undefined });
		store.set("ns2::key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should skip expired entries and delete them", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store);

		// Set a valid entry
		await keyv.set("key1", "value1");

		// Set an expired entry manually
		store.set("key2", { value: "value2", expires: Date.now() - 1000 });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe("key1");

		// Verify expired entry was deleted
		expect(store.has("key2")).toBe(false);
	});

	test("should return empty iterator when store does not support entries", async () => {
		const customStore = {
			get: (_key: string) => undefined,
			set: (_key: string, _value: unknown) => {},
			delete: (_key: string) => true,
			clear: () => {},
			has: (_key: string) => false,
		};

		const keyv = new KeyvGenericStore(customStore);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(0);
	});

	test("should strip namespace prefix from keys when iterating with namespace", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, { namespace: "myns" });

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("myns")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		// Keys should not have namespace prefix
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should work with custom key separator", async () => {
		const store = new Map();
		const keyv = new KeyvGenericStore(store, { keySeparator: ":" });

		// Set entries with custom separator manually
		store.set("ns1:key1", { value: "value1", expires: undefined });
		store.set("ns1:key2", { value: "value2", expires: undefined });
		store.set("ns2:key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});
});
