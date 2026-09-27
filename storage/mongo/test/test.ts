// biome-ignore-all lint/suspicious/noExplicitAny: test file
import { PassThrough, Writable } from "node:stream";
import { faker } from "@faker-js/faker";
import { delay, keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { afterAll, describe, expect, test } from "vitest";
import KeyvMongo, { createKeyv } from "../src/index.js";

const options = { serverSelectionTimeoutMS: 5000, db: "keyvdb" };
const mongoURL = "mongodb://127.0.0.1:27017";
const store = () => new KeyvMongo(mongoURL, options);

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
storageTestSuite(test, store);

afterAll(async () => {
	let keyv = new KeyvMongo({ ...options });
	await keyv.clear();
	keyv = new KeyvMongo({ collection: "foo", useGridFS: true, ...options });
	await keyv.clear();
	await keyv.disconnect();
});

describe("constructor", () => {
	test("merges the collection option into defaults when a url string is passed", () => {
		const store = new KeyvMongo(mongoURL, { collection: "foo" });
		expect(store.url).toBe(mongoURL);
		expect(store.collection).toBe("foo");
	});

	test("uses the uri option as the url", () => {
		const store = new KeyvMongo({ uri: mongoURL });
		expect(store.url).toBe(mongoURL);
	});

	test("sets default properties", () => {
		const store = new KeyvMongo();
		expect(store.url).toBe(mongoURL);
		expect(store.collection).toBe("keyv");
		expect(store.useGridFS).toBe(false);
		expect(store.db).toBeUndefined();
		expect(store.namespace).toBeUndefined();
		expect(store.readPreference).toBeUndefined();
	});

	test("sets properties from constructor options", () => {
		const store = new KeyvMongo({
			url: mongoURL,
			collection: "custom",
			useGridFS: true,
			db: "testdb",
		});
		expect(store.url).toBe(mongoURL);
		expect(store.collection).toBe("custom");
		expect(store.useGridFS).toBe(true);
		expect(store.db).toBe("testdb");
	});

	test("updates properties via setters", () => {
		const store = new KeyvMongo();
		store.url = "mongodb://localhost:27018";
		expect(store.url).toBe("mongodb://localhost:27018");
		store.namespace = "test-ns";
		expect(store.namespace).toBe("test-ns");
		store.collection = "custom-collection";
		expect(store.collection).toBe("custom-collection");
		store.db = "mydb";
		expect(store.db).toBe("mydb");
		store.readPreference = undefined;
		expect(store.readPreference).toBeUndefined();
	});

	test("sets properties from options when the url is undefined", () => {
		const store = new KeyvMongo(undefined, {
			collection: "from-options",
			db: "optionsdb",
			readPreference: "primary" as any,
		});
		expect(store.collection).toBe("from-options");
		expect(store.db).toBe("optionsdb");
		expect(store.readPreference).toBe("primary");
	});

	test("sets the url and collection from a url string and options", () => {
		const store = new KeyvMongo(mongoURL, { collection: "cache", ...options });
		expect(store.url).toBe(mongoURL);
		expect(store.collection).toBe("cache");
	});
});

describe("get", () => {
	test("returns undefined for a missing key", async () => {
		const store = new KeyvMongo({ ...options });
		expect(await store.get(faker.string.alphanumeric(10))).toBeUndefined();
	});

	test("returns undefined and deletes an expired entry", async () => {
		const store = new KeyvMongo({ ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "expiring-value", Date.now() - 1000);
		await delay(50);
		expect(await store.get(key)).toBeUndefined();
	});

	test("returns undefined for a missing key in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		expect(await store.get(faker.string.alphanumeric(10))).toBeUndefined();
	});

	test("returns a stored value in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "keyv1");
		expect(await store.get(key)).toBe("keyv1");
	});

	test("returns undefined and deletes an expired entry in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "expiring-value", Date.now() - 1000);
		await delay(50);
		expect(await store.get(key)).toBeUndefined();
	});
});

describe("getMany", () => {
	test("returns values in order in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		await store.set(keys[0], "bar");
		await store.set(keys[1], "bar1");
		await store.set(keys[2], "bar2");
		expect(await store.getMany<string>(keys)).toEqual(["bar", "bar1", "bar2"]);
	});

	test("returns undefined for missing keys among present ones in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		await store.set(keys[0], "bar");
		await store.set(keys[2], "bar2");
		expect(await store.getMany<string>(keys)).toEqual(["bar", undefined, "bar2"]);
	});

	test("returns all undefined when no keys exist in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const values = await store.getMany<string>([
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		]);
		expect(values).toStrictEqual([undefined, undefined, undefined]);
	});
});

describe("set and setMany", () => {
	test("stores and returns a value in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		const result = await store.set(key, "keyv1");
		expect(result).toBe(true);
		expect(await store.get(key)).toBe("keyv1");
	});

	test("stores a value with an expiry in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		expect(await store.set(key, "keyv1", Date.now() + 60000)).toBe(true);
	});

	test("setMany stores multiple values with a per-entry expiry", async () => {
		const store = new KeyvMongo({ ...options });
		const keys = [faker.string.alphanumeric(10), faker.string.alphanumeric(10)];
		await store.setMany([
			{ key: keys[0], value: "val1", expires: Date.now() + 60000 },
			{ key: keys[1], value: "val2" },
		]);
		expect(await store.get(keys[0])).toBe("val1");
		expect(await store.get(keys[1])).toBe("val2");
	});

	test("setMany returns an empty array when given no entries", async () => {
		const store = new KeyvMongo({ ...options });
		try {
			expect(await store.setMany([])).toEqual([]);
		} finally {
			await store.disconnect();
		}
	});

	test("setMany upserts existing keys", async () => {
		const store = new KeyvMongo({ ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "original");
		await store.setMany([{ key, value: "updated" }]);
		expect(await store.get(key)).toBe("updated");
	});

	test("setMany stores multiple values in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [faker.string.alphanumeric(10), faker.string.alphanumeric(10)];
		await store.setMany([
			{ key: keys[0], value: "val1" },
			{ key: keys[1], value: "val2" },
		]);
		expect(await store.get(keys[0])).toBe("val1");
		expect(await store.get(keys[1])).toBe("val2");
	});

	test("setMany emits an error and returns false entries on connection failure", async () => {
		const store = new KeyvMongo({ ...options });
		const client = await store.connect;
		// Close the connection to make bulkWrite throw.
		await client.mongoClient.close();
		let emittedError = false;
		store.on("error", () => {
			emittedError = true;
		});
		const result = await store.setMany([
			{ key: faker.string.alphanumeric(10), value: "val1" },
			{ key: faker.string.alphanumeric(10), value: "val2" },
		]);
		expect(result).toEqual([false, false]);
		expect(emittedError).toBe(true);
	});

	test("setMany tracks per-entry failures on a MongoBulkWriteError", async () => {
		const { MongoBulkWriteError } = await import("mongodb");
		const store = new KeyvMongo({ ...options });
		const client = await store.connect;
		const originalBulkWrite = client.store.bulkWrite.bind(client.store);
		// Mock bulkWrite to throw a MongoBulkWriteError with a write error at index 1.
		client.store.bulkWrite = async () => {
			throw new MongoBulkWriteError(
				{
					message: "write error",
					code: 11000,
					writeErrors: [{ index: 1, code: 11000, errmsg: "dup key" }] as any,
				},
				{
					insertedCount: 1,
					matchedCount: 0,
					modifiedCount: 0,
					deletedCount: 0,
					upsertedCount: 0,
					insertedIds: {},
					upsertedIds: {},
				} as any,
			);
		};

		let emittedError = false;
		store.on("error", () => {
			emittedError = true;
		});
		const result = await store.setMany([
			{ key: "key1", value: "val1" },
			{ key: "key2", value: "val2" },
			{ key: "key3", value: "val3" },
		]);
		expect(result).toEqual([true, false, true]);
		expect(emittedError).toBe(true);
		client.store.bulkWrite = originalBulkWrite;
	});

	test("setMany returns per-entry results when a GridFS set fails", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		// Mock the set method to throw for the second call.
		let callCount = 0;
		const originalSet = store.set.bind(store);
		store.set = async (key: string, value: any, expires?: number) => {
			callCount++;
			if (callCount === 2) {
				throw new Error("GridFS set failure");
			}

			return originalSet(key, value, expires);
		};

		const result = await store.setMany([
			{ key: "key1", value: "val1" },
			{ key: "key2", value: "val2" },
		]);
		expect(result).toEqual([true, false]);
		store.set = originalSet;
	});
});

describe("has and hasMany", () => {
	test("hasMany checks multiple keys in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		await store.set(keys[0], "val1");
		await store.set(keys[1], "val2");
		expect(await store.hasMany(keys)).toEqual([true, true, false]);
	});
});

describe("delete and deleteMany", () => {
	test("deletes a value in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "keyv1");
		expect(await store.delete(key)).toBe(true);
	});

	test("returns false when deleting a missing key in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		expect(await store.delete(faker.string.alphanumeric(10))).toBe(false);
	});

	test("returns false for a non-string key", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		// @ts-expect-error - test invalid input
		expect(await store.delete({ ok: true })).toBe(false);
	});

	test("deleteMany deletes multiple keys in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const keys = [
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		];
		await store.set(keys[0], "bar");
		await store.set(keys[1], "bar1");
		await store.set(keys[2], "bar2");
		expect(await store.deleteMany(keys)).toEqual([true, true, true]);
		expect(await store.get(keys[0])).toBeUndefined();
		expect(await store.get(keys[1])).toBeUndefined();
		expect(await store.get(keys[2])).toBeUndefined();
	});

	test("deleteMany returns false for missing keys in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		expect(
			await store.deleteMany([faker.string.alphanumeric(10), faker.string.alphanumeric(10)]),
		).toEqual([false, false]);
	});

	test("returns false when the GridFS bucket delete throws", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "some-data");
		const client = await store.connect;
		// Close the connection to make bucket.delete throw.
		await client.mongoClient.close();
		expect(await store.delete(key)).toBe(false);
	});
});

describe("clear", () => {
	test("clears the store in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		expect(await store.clear()).toBeUndefined();
	});

	test("clears the store with the default namespace", async () => {
		const store = new KeyvMongo({ ...options });
		expect(await store.clear()).toBeUndefined();
	});

	test("clearing an empty store does not throw", async () => {
		const store = new KeyvMongo({ ...options });
		await store.clear();
		await store.clear();
	});

	test("clearing an empty store does not throw in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		await store.clear();
		await store.clear();
	});
});

describe("iterator", () => {
	test("iterates over keys in the default namespace", async () => {
		const store = new KeyvMongo({ ...options });
		await store.clear();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, "bar");
		await store.set(key2, "bar2");
		const keys: string[] = [];
		for await (const [key] of store.iterator()) {
			keys.push(key);
		}

		expect(keys).toContain(key1);
		expect(keys).toContain(key2);
	});

	test("iterates over keys within a namespace", async () => {
		const store = new KeyvMongo({ namespace: faker.string.alphanumeric(8), ...options });
		await store.clear();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, "bar");
		await store.set(key2, "bar2");
		const keys: string[] = [];
		for await (const [key] of store.iterator()) {
			keys.push(key);
		}

		expect(keys).toEqual(expect.arrayContaining([key1, key2]));
		expect(keys.length).toBe(2);
	});

	test("iterates over keys in the default namespace in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		await store.clear();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, "bar");
		await store.set(key2, "bar2");
		const keys: string[] = [];
		for await (const [key] of store.iterator()) {
			keys.push(key);
		}

		expect(keys).toContain(key1);
		expect(keys).toContain(key2);
	});

	test("iterates over keys within a namespace in GridFS", async () => {
		const store = new KeyvMongo({
			namespace: faker.string.alphanumeric(8),
			useGridFS: true,
			...options,
		});
		await store.clear();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, "bar");
		await store.set(key2, "bar2");
		const keys: string[] = [];
		for await (const [key] of store.iterator()) {
			keys.push(key);
		}

		expect(keys).toEqual(expect.arrayContaining([key1, key2]));
		expect(keys.length).toBe(2);
	});

	test("skips and deletes expired entries in GridFS", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		await store.clear();
		const expiredKey = faker.string.alphanumeric(10);
		const freshKey = faker.string.alphanumeric(10);
		await store.set(expiredKey, "expired-value", Date.now() - 1000);
		await store.set(freshKey, "fresh-value");
		await delay(50);
		const entries: Array<[string, unknown]> = [];
		for await (const entry of store.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe(freshKey);
	});
});

describe("namespace", () => {
	test("stores and retrieves with the default namespace", async () => {
		const store = new KeyvMongo({ ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "testvalue");
		expect(await store.get(key)).toBe("testvalue");
	});

	test("stores the same key independently across namespaces", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(key, "value1");
		await store2.set(key, "value2");

		expect(await store1.get(key)).toBe("value1");
		expect(await store2.get(key)).toBe("value2");
	});

	test("keeps a key that starts with the namespace apart from the key without it", async () => {
		const ns = faker.string.alphanumeric(8);
		const store = new KeyvMongo({ namespace: ns, ...options });

		const key = faker.string.alphanumeric(10);
		const prefixedKey = `${ns}:${key}`;
		await store.set(prefixedKey, "prefixed");
		await store.set(key, "plain");

		expect(await store.get(prefixedKey)).toBe("prefixed");
		expect(await store.get(key)).toBe("plain");
		expect(await store.getMany([prefixedKey, key])).toEqual(["prefixed", "plain"]);
		expect(await store.delete(key)).toBe(true);
		expect(await store.has(prefixedKey)).toBe(true);
	});

	test("clear only affects the configured namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "value1");
		await store2.set(`${ns2}:${key}`, "value2");

		await store1.clear();

		expect(await store1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await store2.get(`${ns2}:${key}`)).toBe("value2");
	});

	test("delete is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");
		await store2.set(`${ns2}:${key}`, "val2");

		expect(await store1.delete(`${ns1}:${key}`)).toBe(true);
		expect(await store1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await store2.get(`${ns2}:${key}`)).toBe("val2");
	});

	test("deleteMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");
		await store2.set(`${ns2}:${key}`, "val2");

		expect(await store1.deleteMany([`${ns1}:${key}`])).toEqual([true]);
		expect(await store1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await store2.get(`${ns2}:${key}`)).toBe("val2");
	});

	test("has is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");

		expect(await store1.has(`${ns1}:${key}`)).toBe(true);
		expect(await store2.has(`${ns2}:${key}`)).toBe(false);
	});

	test("hasMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");

		expect(
			await store1.hasMany([`${ns1}:${key}`, `${ns1}:${faker.string.alphanumeric(10)}`]),
		).toEqual([true, false]);
	});

	test("getMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");
		await store2.set(`${ns2}:${key}`, "val2");

		expect(await store1.getMany([`${ns1}:${key}`])).toEqual(["val1"]);
		expect(await store1.getMany([`${ns2}:${key}`])).toEqual([undefined]);
	});

	test("setMany is scoped to the namespace", async () => {
		const ns = faker.string.alphanumeric(8);
		const store = new KeyvMongo({ namespace: ns, ...options });
		const keys = [
			`${ns}:${faker.string.alphanumeric(10)}`,
			`${ns}:${faker.string.alphanumeric(10)}`,
		];
		await store.setMany([
			{ key: keys[0], value: "val1" },
			{ key: keys[1], value: "val2" },
		]);
		expect(await store.get(keys[0])).toBe("val1");
		expect(await store.get(keys[1])).toBe("val2");
	});

	test("iterator only yields keys from the configured namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, ...options });

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store1.set(key1, "val1");
		await store1.set(key2, "val2");
		await store2.set(faker.string.alphanumeric(10), "val3");

		const keys: string[] = [];
		for await (const [key] of store1.iterator()) {
			keys.push(key);
		}

		expect(keys.length).toBe(2);
		expect(keys).toEqual(expect.arrayContaining([key1, key2]));
	});

	test("two Keyv instances with different namespaces do not conflict", async () => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const keyvA = new Keyv({ store: new KeyvMongo({ ...options }), namespace: nsA });
		const keyvB = new Keyv({ store: new KeyvMongo({ ...options }), namespace: nsB });

		const key = faker.string.alphanumeric(10);
		expect(await keyvA.set(key, "valueA")).toBe(true);
		expect(await keyvB.set(key, "valueB")).toBe(true);
		expect(await keyvA.get(key)).toBe("valueA");
		expect(await keyvB.get(key)).toBe("valueB");
	});

	test("stores the same key independently across namespaces in GridFS", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, useGridFS: true, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, useGridFS: true, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(key, "value1");
		await store2.set(key, "value2");

		expect(await store1.get(key)).toBe("value1");
		expect(await store2.get(key)).toBe("value2");
	});

	test("keeps a key that starts with the namespace apart from the key without it in GridFS", async () => {
		const ns = faker.string.alphanumeric(8);
		const store = new KeyvMongo({ namespace: ns, useGridFS: true, ...options });

		const key = faker.string.alphanumeric(10);
		const prefixedKey = `${ns}:${key}`;
		await store.set(prefixedKey, "prefixed");
		await store.set(key, "plain");

		expect(await store.get(prefixedKey)).toBe("prefixed");
		expect(await store.get(key)).toBe("plain");
		expect(await store.delete(key)).toBe(true);
		expect(await store.has(prefixedKey)).toBe(true);
	});

	test("clear only affects the configured namespace in GridFS", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, useGridFS: true, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, useGridFS: true, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "value1");
		await store2.set(`${ns2}:${key}`, "value2");

		await store1.clear();

		expect(await store1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await store2.get(`${ns2}:${key}`)).toBe("value2");
	});

	test("delete is scoped to the namespace in GridFS", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, useGridFS: true, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, useGridFS: true, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");
		await store2.set(`${ns2}:${key}`, "val2");

		expect(await store1.delete(`${ns1}:${key}`)).toBe(true);
		expect(await store1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await store2.get(`${ns2}:${key}`)).toBe("val2");
	});

	test("has is scoped to the namespace in GridFS", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, useGridFS: true, ...options });
		const store2 = new KeyvMongo({ namespace: ns2, useGridFS: true, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");

		expect(await store1.has(`${ns1}:${key}`)).toBe(true);
		expect(await store2.has(`${ns2}:${key}`)).toBe(false);
	});

	test("hasMany is scoped to the namespace in GridFS", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const store1 = new KeyvMongo({ namespace: ns1, useGridFS: true, ...options });

		const key = faker.string.alphanumeric(10);
		await store1.set(`${ns1}:${key}`, "val1");

		expect(
			await store1.hasMany([`${ns1}:${key}`, `${ns1}:${faker.string.alphanumeric(10)}`]),
		).toEqual([true, false]);
	});

	test("two Keyv instances with different namespaces do not conflict in GridFS", async () => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const keyvA = new Keyv({
			store: new KeyvMongo({ useGridFS: true, ...options }),
			namespace: nsA,
		});
		const keyvB = new Keyv({
			store: new KeyvMongo({ useGridFS: true, ...options }),
			namespace: nsB,
		});

		const key = faker.string.alphanumeric(10);
		expect(await keyvA.set(key, "valueA")).toBe(true);
		expect(await keyvB.set(key, "valueB")).toBe(true);
		expect(await keyvA.get(key)).toBe("valueA");
		expect(await keyvB.get(key)).toBe("valueB");
	});
});

describe("GridFS maintenance", () => {
	test("clearExpired removes expired files", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		await store.clear();
		const key = faker.string.alphanumeric(10);
		await store.set(key, "expiring-value", Date.now() - 1000);
		await delay(50);
		expect(await store.clearExpired()).toBe(true);
		expect(await store.get(key)).toBeUndefined();
	});

	test("clearExpired returns false when not in GridFS mode", async () => {
		const store = new KeyvMongo({ ...options });
		expect(await store.clearExpired()).toBe(false);
	});

	test("clearUnusedFor removes unused files", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "unused-value");
		expect(await store.clearUnusedFor(0)).toBe(true);
	});

	test("clearUnusedFor returns false when not in GridFS mode", async () => {
		const store = new KeyvMongo({ ...options });
		expect(await store.clearUnusedFor(5)).toBe(false);
	});
});

/**
 * Writes a GridFS file for a key straight through the bucket, as data from an earlier release or
 * a set that hasn't deleted the older files yet leaves it.
 */
async function writeFile(
	store: KeyvMongo,
	key: string,
	value: string,
	metadata: Record<string, unknown> = {},
): Promise<void> {
	const client = (await store.connect) as any;
	await new Promise<void>((resolve, reject) => {
		const stream = client.bucket.openUploadStream(key, {
			metadata: { expiresAt: null, lastAccessed: new Date(), namespace: "", ...metadata },
		});
		stream.on("finish", () => resolve());
		stream.on("error", reject);
		stream.end(value);
	});
}

/** Counts the GridFS files stored for a key. */
async function countFiles(store: KeyvMongo, key: string): Promise<number> {
	const client = (await store.connect) as any;
	return client.store.countDocuments({ filename: key });
}

describe("GridFS revisions", () => {
	test("set replaces the value and leaves one file and its chunks", async () => {
		const collection = faker.string.alphanumeric(12);
		const store = new KeyvMongo({ useGridFS: true, collection, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "first");
		await store.set(key, "second");
		await store.set(key, "third");

		expect(await store.get(key)).toBe("third");
		const client = (await store.connect) as any;
		expect(await client.store.countDocuments({})).toBe(1);
		expect(await client.chunks.countDocuments({})).toBe(1);
		await store.clear();
	});

	test("reads the newest file when a key has several", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "old");
		await writeFile(store, key, "new");

		expect(await store.get(key)).toBe("new");
		expect(await store.getMany([key])).toEqual(["new"]);
		expect(await store.has(key)).toBe(true);
		expect(await store.hasMany([key])).toEqual([true]);
		const entries: unknown[] = [];
		for await (const entry of store.iterator()) {
			if ((entry as [string, unknown])[0] === key) {
				entries.push(entry);
			}
		}

		expect(entries).toEqual([[key, "new"]]);
		await store.delete(key);
	});

	test("reads a key whose newest file has expired as missing, not as an older value", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "old");
		await writeFile(store, key, "new", { expiresAt: new Date(Date.now() - 1000) });

		expect(await store.has(key)).toBe(false);
		expect(await store.hasMany([key])).toEqual([false]);
		expect(await store.get(key)).toBeUndefined();
		expect(await countFiles(store, key)).toBe(0);
	});

	test("the iterator deletes an expired key with its older files", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "old");
		await writeFile(store, key, "new", { expiresAt: new Date(Date.now() - 1000) });

		for await (const entry of store.iterator()) {
			expect((entry as [string, unknown])[0]).not.toBe(key);
		}

		expect(await countFiles(store, key)).toBe(0);
	});

	test("delete removes every file for a key", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "old");
		await writeFile(store, key, "new");

		expect(await store.delete(key)).toBe(true);
		expect(await store.get(key)).toBeUndefined();
		expect(await countFiles(store, key)).toBe(0);
	});

	test("clearExpired deletes the older files of an expired key", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "old");
		await writeFile(store, key, "new", { expiresAt: new Date(Date.now() - 1000) });

		expect(await store.clearExpired()).toBe(true);
		expect(await store.get(key)).toBeUndefined();
		expect(await countFiles(store, key)).toBe(0);
	});

	test("clearUnusedFor deletes the older files of an unused key", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "old");
		await writeFile(store, key, "new", { lastAccessed: new Date(Date.now() - 120_000) });

		expect(await store.clearUnusedFor(60)).toBe(true);
		expect(await store.get(key)).toBeUndefined();
		expect(await countFiles(store, key)).toBe(0);
	});

	test("set keeps a file written after its own", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await writeFile(store, key, "later");
		// Date the file after the set below, as if another set finished writing after it.
		const client = (await store.connect) as any;
		await client.store.updateOne(
			{ filename: key },
			{ $set: { uploadDate: new Date(Date.now() + 60_000) } },
		);

		await store.set(key, "earlier");
		expect(await store.get(key)).toBe("later");
		expect(await countFiles(store, key)).toBe(2);
		await store.delete(key);
	});

	test("get reads the newest file again when a read fails", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "value");
		const client = (await store.connect) as any;
		const openDownloadStream = client.bucket.openDownloadStream.bind(client.bucket);
		let reads = 0;
		// The first read fails, as it does when a set deletes the file while it is read.
		client.bucket.openDownloadStream = (id: unknown) => {
			reads++;
			if (reads === 1) {
				const failed = new PassThrough();
				queueMicrotask(() => failed.emit("error", new Error("FileNotFound")));
				return failed;
			}

			return openDownloadStream(id);
		};

		try {
			expect(await store.get(key)).toBe("value");
			expect(reads).toBe(2);
		} finally {
			client.bucket.openDownloadStream = openDownloadStream;
			await store.delete(key);
		}
	});

	test("get returns undefined when the read fails twice", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "value");
		const client = (await store.connect) as any;
		const openDownloadStream = client.bucket.openDownloadStream.bind(client.bucket);
		client.bucket.openDownloadStream = () => {
			const failed = new PassThrough();
			queueMicrotask(() => failed.emit("error", new Error("read failed")));
			return failed;
		};

		try {
			expect(await store.get(key)).toBeUndefined();
		} finally {
			client.bucket.openDownloadStream = openDownloadStream;
			await store.delete(key);
		}
	});

	test("set returns false and keeps the old value when the upload fails", async () => {
		const store = new KeyvMongo({ useGridFS: true, ...options });
		const key = faker.string.alphanumeric(10);
		await store.set(key, "old");
		const client = (await store.connect) as any;
		const openUploadStream = client.bucket.openUploadStream.bind(client.bucket);
		client.bucket.openUploadStream = () =>
			new Writable({
				write(_chunk, _encoding, callback) {
					callback(new Error("upload failed"));
				},
			});

		try {
			expect(await store.set(key, "new")).toBe(false);
		} finally {
			client.bucket.openUploadStream = openUploadStream;
		}

		expect(await store.get(key)).toBe("old");
		await store.delete(key);
	});
});

describe("events", () => {
	test("re-emits errors from the underlying MongoClient", async () => {
		const store = new KeyvMongo({ ...options });
		const client = await store.connect;
		const error = new Error("client failure");
		const received = new Promise<Error>((resolve) => {
			store.on("error", (error_: Error) => {
				resolve(error_);
			});
		});
		client.mongoClient.emit("error", error);
		expect(await received).toBe(error);
		await store.disconnect();
	});
});

describe("disconnect", () => {
	test("closes the connection", async () => {
		const keyv = new KeyvMongo({ namespace: faker.string.alphanumeric(8), ...options });
		expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
		await keyv.disconnect();
		await expect(keyv.get(faker.string.alphanumeric(10))).rejects.toBeDefined();
	});

	test("closes the connection in GridFS", async () => {
		const keyv = new KeyvMongo({ useGridFS: true, ...options });
		expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
		await keyv.disconnect();
		await expect(keyv.get(faker.string.alphanumeric(10))).rejects.toBeDefined();
	});

	test("disconnecting an unused connection does not throw", async () => {
		const keyv = new KeyvMongo({ namespace: faker.string.alphanumeric(8), ...options });
		await expect(keyv.disconnect()).resolves.toBeUndefined();
	});
});

describe("createKeyv", () => {
	test("returns a Keyv instance from a uri string", async () => {
		const keyv = createKeyv(mongoURL);
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "value");
		expect(await keyv.get(key)).toBe("value");
	});

	test("returns a Keyv instance from an options object", async () => {
		const keyv = createKeyv({ url: mongoURL, collection: "keyv", ...options });
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "value");
		expect(await keyv.get(key)).toBe("value");
	});

	test("applies the namespace option", async () => {
		const ns = faker.string.alphanumeric(8);
		const keyv = createKeyv({ namespace: ns, url: mongoURL, ...options });
		expect(keyv.namespace).toBe(ns);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "bar");
		expect(await keyv.get(key)).toBe("bar");
		// The adapter stores the key as given, scoped to its namespace.
		const storeInstance = keyv.store as KeyvMongo;
		expect(storeInstance.namespace).toBe(ns);
		expect(await storeInstance.get(key)).toBeDefined();
	});

	test("isolates different namespaces", async () => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const keyvA = createKeyv({ namespace: nsA, url: mongoURL, ...options });
		const keyvB = createKeyv({ namespace: nsB, url: mongoURL, ...options });

		const key = faker.string.alphanumeric(10);
		await keyvA.set(key, "valueA");
		await keyvB.set(key, "valueB");

		expect(await keyvA.get(key)).toBe("valueA");
		expect(await keyvB.get(key)).toBe("valueB");

		// clear only affects its own namespace.
		await keyvA.clear();
		expect(await keyvA.get(key)).toBeUndefined();
		expect(await keyvB.get(key)).toBe("valueB");
	});
});
