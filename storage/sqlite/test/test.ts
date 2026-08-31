import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Hookified } from "hookified";
import Keyv from "keyv";
import { beforeEach, describe, expect, test, vi } from "vitest";
import KeyvSqlite, { createKeyv } from "../src/index.js";

const sqliteUri = "sqlite://test/testdb.sqlite";
const store = () => new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
// The v6 contract passes an absolute `expires` directly, so the adapter now handles
// storage-level expiry (previously skipped because expiry was parsed from the value).
storageTestSuite(test, store);

beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

describe("constructor", () => {
	test("should set the uri when constructed with a string", () => {
		const keyv = new KeyvSqlite(sqliteUri);
		expect(keyv.uri).toBe(sqliteUri);
	});

	test("should return default property values", async () => {
		const keyv = new KeyvSqlite();
		expect(keyv.uri).toBe("sqlite://:memory:");
		expect(keyv.table).toBe("keyv");
		expect(keyv.keySize).toBe(255);
		expect(keyv.namespaceLength).toBe(255);
		expect(keyv.db).toBe(":memory:");
		expect(keyv.iterationLimit).toBe(10);
		expect(keyv.wal).toBe(false);
		expect(keyv.busyTimeout).toBeUndefined();
		expect(keyv.driver).toBeUndefined();
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.clearExpiredInterval).toBe(0);
		await keyv.disconnect();
	});

	test("should return constructor-provided property values", async () => {
		const keyv = new KeyvSqlite({
			uri: "sqlite://:memory:",
			table: "custom",
			keySize: 512,
			namespaceLength: 128,
			busyTimeout: 5000,
			iterationLimit: 50,
			wal: false,
			driver: "better-sqlite3",
		});
		expect(keyv.table).toBe("custom");
		expect(keyv.keySize).toBe(512);
		expect(keyv.namespaceLength).toBe(128);
		expect(keyv.busyTimeout).toBe(5000);
		expect(keyv.iterationLimit).toBe(50);
		expect(keyv.driver).toBe("better-sqlite3");
		await keyv.disconnect();
	});

	test("should return all configured property values", () => {
		const keyv = new KeyvSqlite({
			uri: sqliteUri,
			keySize: 512,
			namespaceLength: 128,
			busyTimeout: 5000,
			iterationLimit: 50,
			wal: false,
			clearExpiredInterval: 1000,
		});
		expect(keyv.uri).toBe(sqliteUri);
		expect(keyv.keySize).toBe(512);
		expect(keyv.keyLength).toBe(512);
		expect(keyv.namespaceLength).toBe(128);
		expect(keyv.busyTimeout).toBe(5000);
		expect(keyv.iterationLimit).toBe(50);
		expect(keyv.wal).toBe(false);
		expect(keyv.clearExpiredInterval).toBe(1000);
	});

	test("should respect the namespaceLength option", () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, namespaceLength: 128 });
		expect(keyv.namespaceLength).toBe(128);
	});

	test("should treat keyLength as an alias for keySize", () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, keyLength: 512 });
		expect(keyv.keySize).toBe(512);
		expect(keyv.keyLength).toBe(512);
	});

	test("should sanitize numeric, alphabetic, and special-character table names", () => {
		let keyv = new KeyvSqlite({
			uri: sqliteUri,
			// @ts-expect-error testing a numeric table name
			table: 3000,
		});
		expect(keyv.table).toBe("_3000");

		keyv = new KeyvSqlite({ uri: sqliteUri, table: "sample" });
		expect(keyv.table).toBe("sample");

		// Special characters are stripped for SQL injection prevention.
		keyv = new KeyvSqlite({ uri: sqliteUri, table: "$sample" });
		expect(keyv.table).toBe("sample");

		// A table name with only special characters should throw.
		expect(() => new KeyvSqlite({ uri: sqliteUri, table: "$$$" })).toThrow(
			"Invalid table name: must contain alphanumeric characters",
		);
	});

	test("should throw for invalid keySize values", () => {
		expect(
			() =>
				new KeyvSqlite({
					uri: sqliteUri,
					// @ts-expect-error testing an invalid keySize
					keySize: "invalid",
				}),
		).toThrow("Invalid keySize: must be a positive number between 1 and 65535");
		expect(() => new KeyvSqlite({ uri: sqliteUri, keySize: 0 })).toThrow(
			"Invalid keySize: must be a positive number between 1 and 65535",
		);
		expect(() => new KeyvSqlite({ uri: sqliteUri, keySize: -100 })).toThrow(
			"Invalid keySize: must be a positive number between 1 and 65535",
		);
		expect(() => new KeyvSqlite({ uri: sqliteUri, keySize: 70000 })).toThrow(
			"Invalid keySize: must be a positive number between 1 and 65535",
		);
		expect(() => new KeyvSqlite({ uri: sqliteUri, keySize: Infinity })).toThrow(
			"Invalid keySize: must be a positive number between 1 and 65535",
		);
	});

	test("should accept valid keySize values", () => {
		expect(new KeyvSqlite({ uri: sqliteUri, keySize: 100 }).keySize).toBe(100);
		expect(new KeyvSqlite({ uri: sqliteUri, keySize: 65535 }).keySize).toBe(65535);
		expect(new KeyvSqlite({ uri: sqliteUri, keySize: 1 }).keySize).toBe(1);
	});

	test("should use default values when the options object omits uri", async () => {
		const keyv = new KeyvSqlite({ table: "no_uri" });
		expect(keyv.uri).toBe("sqlite://:memory:");
		expect(keyv.db).toBe(":memory:");
		expect(keyv.table).toBe("no_uri");
		await keyv.disconnect();
	});
});

describe("capabilities", () => {
	test("should declare the v6 expires capability", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.capabilities.expires).toBe(true);
		await keyv.disconnect();
	});
});

describe("property setters", () => {
	test("should sanitize the table name via the setter", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		keyv.table = "my_table";
		expect(keyv.table).toBe("my_table");
		keyv.table = '3bad"name';
		expect(keyv.table).toBe("_3badname");
		await keyv.disconnect();
	});

	test("should update keySize via the setter", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.keySize).toBe(255);
		keyv.keySize = 512;
		expect(keyv.keySize).toBe(512);
		await keyv.disconnect();
	});

	test("should update namespaceLength via the setter", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.namespaceLength).toBe(255);
		keyv.namespaceLength = 128;
		expect(keyv.namespaceLength).toBe(128);
		await keyv.disconnect();
	});

	test("should update iterationLimit via the setter", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.iterationLimit).toBe(10);
		keyv.iterationLimit = 99;
		expect(keyv.iterationLimit).toBe(99);
		await keyv.disconnect();
	});
});

describe("opts", () => {
	test("should return a snapshot of the current configuration", () => {
		const keyv = new KeyvSqlite({
			uri: sqliteUri,
			table: "cache",
			keySize: 512,
			iterationLimit: 25,
			wal: false,
		});
		expect(keyv.opts.uri).toBe(sqliteUri);
		expect(keyv.opts.table).toBe("cache");
		expect(keyv.opts.keySize).toBe(512);
		// keySize is also exposed under its keyLength alias.
		expect(keyv.opts.keyLength).toBe(512);
		expect(keyv.opts.iterationLimit).toBe(25);
		expect(keyv.opts.wal).toBe(false);
		// The resolved database path is included as db.
		expect(keyv.opts.db).toBe("test/testdb.sqlite");
	});
});

describe("get", () => {
	test("should return undefined for a missing key", async () => {
		const keyv = store();
		expect(await keyv.get(faker.string.uuid())).toBeUndefined();
	});

	test("should return undefined (not null) for a key stored with a null value", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		// biome-ignore lint/suspicious/noExplicitAny: testing the null value path
		await keyv.set(key, null as any);
		const result = await keyv.get(key);
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
	});

	test("should return undefined (not null) for a SQL NULL stored via query", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		await keyv.query(
			`INSERT INTO "${keyv.table}" (key, value, namespace, expires) VALUES (?, NULL, ?, NULL)`,
			key,
			"",
		);
		const result = await keyv.get(key);
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
	});
});

describe("getMany", () => {
	test("should return multiple values in order", async () => {
		const keyv = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);
		expect(await keyv.getMany([key1, key2, key3])).toStrictEqual([val1, val2, val3]);
	});

	test("should return undefined (not null) for keys stored with a null value", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		// biome-ignore lint/suspicious/noExplicitAny: testing the null value path
		await keyv.set(key, null as any);
		const results = await keyv.getMany([key, faker.string.uuid()]);
		expect(results).toEqual([undefined, undefined]);
		expect(results[0]).not.toBeNull();
	});

	test("should return undefined (not null) from getMany for a SQL NULL stored via query", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		await keyv.query(
			`INSERT INTO "${keyv.table}" (key, value, namespace, expires) VALUES (?, NULL, ?, NULL)`,
			key,
			"",
		);
		const results = await keyv.getMany([key]);
		expect(results).toEqual([undefined]);
		expect(results[0]).not.toBeNull();
	});

	test("should return undefined for expired keys and delete them", async () => {
		const keyv = store();
		const expiredKey1 = faker.string.uuid();
		const expiredKey2 = faker.string.uuid();
		const validKey = faker.string.uuid();
		const pastExpires = Date.now() - 1000;
		const futureExpires = Date.now() + 60_000;
		const expiredValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: pastExpires,
		});
		const validValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: futureExpires,
		});
		await keyv.set(expiredKey1, expiredValue, pastExpires);
		await keyv.set(expiredKey2, expiredValue, pastExpires);
		await keyv.set(validKey, validValue, futureExpires);
		const result = await keyv.getMany([expiredKey1, expiredKey2, validKey]);
		expect(result[0]).toBeUndefined();
		expect(result[1]).toBeUndefined();
		expect(result[2]).toBe(validValue);
		// The expired keys should have been deleted.
		expect(await keyv.get(expiredKey1)).toBeUndefined();
		expect(await keyv.get(expiredKey2)).toBeUndefined();
	});
});

describe("set and setMany", () => {
	test("should upsert existing keys with setMany", async () => {
		const keyv = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const oldVal = faker.lorem.word();
		const newVal = faker.lorem.word();
		const val2 = faker.lorem.word();
		await keyv.set(key1, oldVal);
		await keyv.setMany([
			{ key: key1, value: newVal },
			{ key: key2, value: val2 },
		]);
		expect(await keyv.get(key1)).toBe(newVal);
		expect(await keyv.get(key2)).toBe(val2);
	});

	test("should batch setMany and getMany past SQLite bind-parameter limits", async () => {
		const keyv = store();
		const entries = Array.from({ length: 250 }, () => ({
			key: faker.string.uuid(),
			value: faker.lorem.word(),
		}));
		const results = await keyv.setMany(entries);
		expect(results).toHaveLength(250);
		expect(results?.every(Boolean)).toBe(true);

		const keys = entries.map((entry) => entry.key);
		const missingKey = faker.string.uuid();
		keys.push(missingKey);
		const values = await keyv.getMany(keys);
		expect(values).toHaveLength(251);
		expect(values[0]).toBe(entries[0].value);
		expect(values[249]).toBe(entries[249].value);
		expect(values[250]).toBeUndefined();
		await keyv.deleteMany(keys);
	});

	test("should emit an error from setMany and return false entries on query error", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		let emittedError = false;
		keyv.on("error", () => {
			emittedError = true;
		});
		// Close the connection to force an error.
		await keyv.disconnect();
		const result = await keyv.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
		]);
		expect(result).toEqual([false, false]);
		expect(emittedError).toBe(true);
	});
});

describe("has and hasMany", () => {
	test("should return false from has and delete an expired key", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		const pastExpires = Date.now() - 1000;
		const expiredValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: pastExpires,
		});
		await keyv.set(key, expiredValue, pastExpires);
		expect(await keyv.has(key)).toBe(false);
		// The expired key should have been deleted.
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("should return false from hasMany for expired keys and delete them", async () => {
		const keyv = store();
		const expiredKey1 = faker.string.uuid();
		const expiredKey2 = faker.string.uuid();
		const validKey = faker.string.uuid();
		const pastExpires = Date.now() - 1000;
		const futureExpires = Date.now() + 60_000;
		const expiredValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: pastExpires,
		});
		const validValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: futureExpires,
		});
		await keyv.set(expiredKey1, expiredValue, pastExpires);
		await keyv.set(expiredKey2, expiredValue, pastExpires);
		await keyv.set(validKey, validValue, futureExpires);
		const result = await keyv.hasMany([expiredKey1, expiredKey2, validKey]);
		expect(result).toStrictEqual([false, false, true]);
		// The expired keys should have been deleted.
		expect(await keyv.has(expiredKey1)).toBe(false);
		expect(await keyv.has(expiredKey2)).toBe(false);
	});
});

describe("delete and deleteMany", () => {
	test("should delete multiple records with deleteMany", async () => {
		const keyv = store();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);
		expect(await keyv.getMany([key1, key2, key3])).toStrictEqual([val1, val2, val3]);
		await keyv.deleteMany([key1, key2, key3]);
		expect(await keyv.getMany([key1, key2, key3])).toStrictEqual([undefined, undefined, undefined]);
	});

	test("should return per-key booleans from deleteMany for existing and missing keys", async () => {
		const keyv = store();
		const existingKey1 = faker.string.uuid();
		const existingKey2 = faker.string.uuid();
		const missingKey = faker.string.uuid();
		await keyv.set(existingKey1, faker.lorem.word());
		await keyv.set(existingKey2, faker.lorem.word());
		expect(await keyv.deleteMany([existingKey1, missingKey, existingKey2])).toStrictEqual([
			true,
			false,
			true,
		]);
		// A second delete of the same keys now reports them all as missing.
		expect(await keyv.deleteMany([existingKey1, existingKey2])).toStrictEqual([false, false]);
	});
});

describe("clearExpired", () => {
	test("should remove expired entries and keep valid ones", async () => {
		const keyv = store();
		const pastExpires = Date.now() - 1000;
		const expiredValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: pastExpires,
		});
		const validValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: null,
		});
		const expiredKey = faker.string.uuid();
		const validKey = faker.string.uuid();
		await keyv.set(expiredKey, expiredValue, pastExpires);
		await keyv.set(validKey, validValue);
		// has() already filters expired entries.
		expect(await keyv.has(expiredKey)).toBe(false);
		expect(await keyv.has(validKey)).toBe(true);
		await keyv.clearExpired();
		expect(await keyv.has(expiredKey)).toBe(false);
		expect(await keyv.has(validKey)).toBe(true);
	});

	test("should store non-string object values with an explicit expires", async () => {
		const keyv = store();
		const futureExpires = Date.now() + 60_000;
		const objValue = { value: faker.lorem.word(), expires: futureExpires };
		const objKey = faker.string.uuid();
		// biome-ignore lint/suspicious/noExplicitAny: testing the non-string value path
		await keyv.set(objKey, objValue as any, futureExpires);
		expect(await keyv.has(objKey)).toBe(true);
	});

	// Regression: before v6 the adapter recovered `expires` by JSON.parsing the stored
	// value, which silently failed for compressed/encrypted/msgpackr/superjson output and
	// left the expires column NULL. The contract now passes expires directly.
	test("should populate the expires column for non-JSON encoded values so expiry still works", async () => {
		const store = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000 });
		const serialization = {
			stringify: (data: unknown) => `RAW:${JSON.stringify(data)}`,
			parse: <T>(data: string): T => JSON.parse(String(data).slice(4)) as T,
		};
		// Opt out of Keyv-layer expiry so this test isolates the store's own expires column.
		const keyv = new Keyv({ store, serialization, checkExpired: false });
		const key = faker.string.uuid();
		const serializedValue = faker.lorem.word();
		await keyv.set(key, serializedValue, 100);
		expect(await keyv.get(key)).toBe(serializedValue);
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});
		// With checkExpired off, expiry is driven entirely by the store's expires column.
		expect(await keyv.get(key)).toBeUndefined();
		await store.clearExpired();
		expect(await store.has(key)).toBe(false);
		await keyv.disconnect();
	});
});

describe("clearExpiredInterval", () => {
	test("should automatically clean up expired entries on the configured schedule", async () => {
		const keyv = new KeyvSqlite({
			uri: sqliteUri,
			busyTimeout: 3000,
			clearExpiredInterval: 100,
		});
		await keyv.clear();
		const pastExpires = Date.now() - 1000;
		const expiredValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: pastExpires,
		});
		const autoExpiredKey = faker.string.uuid();
		await keyv.set(autoExpiredKey, expiredValue, pastExpires);
		// has() already filters expired entries.
		expect(await keyv.has(autoExpiredKey)).toBe(false);
		// Wait for the cleanup timer to fire (which deletes the row entirely).
		await new Promise((resolve) => {
			setTimeout(resolve, 250);
		});
		expect(await keyv.has(autoExpiredKey)).toBe(false);
		await keyv.disconnect();
	});

	test("should restart and disable the clearExpired timer via the setter", async () => {
		const keyv = store();
		expect(keyv.clearExpiredInterval).toBe(0);
		keyv.clearExpiredInterval = 500;
		expect(keyv.clearExpiredInterval).toBe(500);
		// Reset to 0 to disable.
		keyv.clearExpiredInterval = 0;
		expect(keyv.clearExpiredInterval).toBe(0);
		await keyv.disconnect();
	});

	test("should not overlap automatic cleanup runs", async () => {
		const keyv = store();
		let releaseCleanup = () => {};
		const blockedCleanup = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const clearExpired = vi
			.spyOn(keyv, "clearExpired")
			.mockImplementation(async () => blockedCleanup);

		try {
			keyv.clearExpiredInterval = 20;
			await vi.waitFor(() => {
				expect(clearExpired).toHaveBeenCalledTimes(1);
			});
			await new Promise((resolve) => {
				setTimeout(resolve, 80);
			});
			expect(clearExpired).toHaveBeenCalledTimes(1);
		} finally {
			keyv.clearExpiredInterval = 0;
			releaseCleanup();
			await keyv.disconnect();
		}
	});
});

describe("namespace", () => {
	test("should store the namespace separately from the key", async () => {
		const storeA = store();
		const storeB = store();
		const namespaceA = faker.string.alphanumeric(8);
		const namespaceB = faker.string.alphanumeric(8);
		storeA.namespace = namespaceA;
		storeB.namespace = namespaceB;

		await storeA.clear();
		await storeB.clear();

		// Same key, different namespaces.
		const nsKey = faker.string.uuid();
		const valA = faker.lorem.word();
		const valB = faker.lorem.word();
		await storeA.set(`${namespaceA}:${nsKey}`, valA);
		await storeB.set(`${namespaceB}:${nsKey}`, valB);

		expect(await storeA.get(`${namespaceA}:${nsKey}`)).toBe(valA);
		expect(await storeB.get(`${namespaceB}:${nsKey}`)).toBe(valB);

		// Clearing one namespace should not affect the other.
		await storeA.clear();
		expect(await storeA.get(`${namespaceA}:${nsKey}`)).toBeUndefined();
		expect(await storeB.get(`${namespaceB}:${nsKey}`)).toBe(valB);

		await storeB.clear();
	});

	test("should isolate data across multiple Keyv instances", async () => {
		const namespaceA = faker.string.alphanumeric(8);
		const namespaceB = faker.string.alphanumeric(8);
		const keyvA = new Keyv({ store: store(), namespace: namespaceA });
		const keyvB = new Keyv({ store: store(), namespace: namespaceB });

		await keyvA.clear();
		await keyvB.clear();

		const keyA1 = faker.string.uuid();
		const keyA2 = faker.string.uuid();
		const keyA3 = faker.string.uuid();
		const valA1 = faker.lorem.word();
		const valA2 = faker.lorem.word();
		const valA3 = faker.lorem.word();
		const valB1 = faker.lorem.word();
		const valB2 = faker.lorem.word();
		const valB3 = faker.lorem.word();

		await keyvA.set(keyA1, valA1);
		await keyvA.set(keyA2, valA2);
		await keyvA.set(keyA3, valA3);

		await keyvB.set(keyA1, valB1);
		await keyvB.set(keyA2, valB2);
		await keyvB.set(keyA3, valB3);

		expect(await keyvA.get([keyA1, keyA2, keyA3])).toStrictEqual([valA1, valA2, valA3]);
		expect(await keyvB.get([keyA1, keyA2, keyA3])).toStrictEqual([valB1, valB2, valB3]);

		// The iterator reads the namespace from the Keyv instance — none is passed in.
		const iteratorResultA = new Map<string, string>();
		for await (const [key, value] of keyvA.iterator()) {
			iteratorResultA.set(key, value);
		}

		expect(iteratorResultA).toStrictEqual(
			new Map([
				[keyA1, valA1],
				[keyA2, valA2],
				[keyA3, valA3],
			]),
		);
	});
});

describe("iterator", () => {
	test("should iterate over a single element", async () => {
		const keyv = store();
		await keyv.clear();
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		for await (const [key, value] of keyv.iterator()) {
			expect(key).toBe(testKey);
			expect(value).toBe(testVal);
		}
	});

	test("should iterate over multiple elements", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000, iterationLimit: 3 });
		await keyv.clear();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);
		const expected = new Map([
			[key1, val1],
			[key2, val2],
			[key3, val3],
		]);
		const actual = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			actual.set(key, value);
		}

		expect(actual).toStrictEqual(expected);
	});

	test("should iterate over multiple elements with an iterationLimit of 1", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000, iterationLimit: 1 });
		await keyv.clear();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);
		const expected = new Map([
			[key1, val1],
			[key2, val2],
			[key3, val3],
		]);
		const actual = new Map<string, string>();
		const iterator = keyv.iterator();
		let entry = await iterator.next();
		while (!entry.done) {
			const [k, v] = entry.value;
			actual.set(k, v);
			entry = await iterator.next();
		}

		expect(actual).toStrictEqual(expected);
	});

	test("should return no entries when the store is empty (no namespace passed)", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000, iterationLimit: 1 });
		await keyv.clear();
		const iterator = keyv.iterator();
		const entry = await iterator.next();
		expect(entry.value).toBeUndefined();
		expect(entry.done).toBe(true);
	});

	test("should iterate using the configured namespace without passing it to iterator()", async () => {
		const keyv = store();
		const namespace = faker.string.alphanumeric(8);
		keyv.namespace = namespace;
		await keyv.clear();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await keyv.set(`${namespace}:${key1}`, val1);
		await keyv.set(`${namespace}:${key2}`, val2);

		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.size).toBe(2);
		expect(collected.get(key1)).toBe(val1);
		expect(collected.get(key2)).toBe(val2);
		await keyv.clear();
	});

	test("should fall back to the default limit when iterationLimit is 0", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000, iterationLimit: 0 });
		const namespace = faker.string.alphanumeric(8);
		keyv.namespace = namespace;
		await keyv.clear();
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await keyv.set(`${namespace}:${key}`, val);

		const keys: string[] = [];
		for await (const [k] of keyv.iterator()) {
			keys.push(k);
		}

		expect(keys).toContain(key);
		await keyv.clear();
	});

	test("should yield undefined instead of null when the stored value is SQL NULL", async () => {
		const keyv = store();
		await keyv.clear();
		const key = faker.string.uuid();
		await keyv.query(
			`INSERT INTO "${keyv.table}" (key, value, namespace, expires) VALUES (?, NULL, ?, NULL)`,
			key,
			"",
		);
		const values: Array<string | undefined> = [];
		for await (const [iterKey, value] of keyv.iterator()) {
			if (iterKey === key) {
				expect(value).not.toBeNull();
				values.push(value);
			}
		}

		expect(values).toEqual([undefined]);
		await keyv.clear();
	});
});

describe("events", () => {
	test("should extend Hookified", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv).toBeInstanceOf(Hookified);
		await keyv.disconnect();
	});

	test("should expose the Hookified event methods", () => {
		const keyv = store();
		expect(typeof keyv.on).toBe("function");
		expect(typeof keyv.once).toBe("function");
		expect(typeof keyv.emit).toBe("function");
		expect(typeof keyv.onHook).toBe("function");
	});

	test("should emit and receive a custom event", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		const payload = faker.lorem.word();
		let received: unknown;
		keyv.on("test-event", (value: unknown) => {
			received = value;
		});
		keyv.emit("test-event", payload);
		expect(received).toBe(payload);
		await keyv.disconnect();
	});

	test("should invoke a once listener only once", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		let count = 0;
		keyv.once("ping", () => {
			count += 1;
		});
		keyv.emit("ping");
		keyv.emit("ping");
		expect(count).toBe(1);
		await keyv.disconnect();
	});

	test("should run a Hookified hook registered with onHook", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		let called = false;
		keyv.onHook("custom", () => {
			called = true;
		});
		await keyv.hook("custom");
		expect(called).toBe(true);
		await keyv.disconnect();
	});

	test("should not throw when emitting error with no listeners", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(() => keyv.emit("error", new Error(faker.lorem.sentence()))).not.toThrow();
		await keyv.disconnect();
	});

	test("should emit an error event when an operation fails", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		const failedKey = faker.string.uuid();
		const failedValue = faker.lorem.word();
		const error = await new Promise<unknown>((resolve) => {
			keyv.on("error", (emitted: unknown) => resolve(emitted));
			// Close the connection then trigger an operation to force an error.
			void keyv.disconnect().then(() => keyv.setMany([{ key: failedKey, value: failedValue }]));
		});
		expect(error).toBeInstanceOf(Error);
	});
});

describe("WAL mode", () => {
	test("should enable WAL for a file-based database", async () => {
		const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb-wal.sqlite", wal: true });
		const result = (await keyv.query("PRAGMA journal_mode")) as Array<{ journal_mode: string }>;
		expect(result[0].journal_mode).toBe("wal");
		await keyv.disconnect();
	});

	test("should not enable WAL by default", async () => {
		const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb-nowal.sqlite" });
		const result = (await keyv.query("PRAGMA journal_mode")) as Array<{ journal_mode: string }>;
		expect(result[0].journal_mode).not.toBe("wal");
		await keyv.disconnect();
	});

	test("should ignore WAL for an in-memory database and still operate", async () => {
		const keyv = new KeyvSqlite({ uri: "sqlite://:memory:", wal: true });
		const result = (await keyv.query("PRAGMA journal_mode")) as Array<{ journal_mode: string }>;
		// In-memory databases cannot use WAL mode; they remain in "memory" journal mode.
		expect(result[0].journal_mode).toBe("memory");
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.disconnect();
	});

	test("should log a warning for an in-memory database", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const keyv = new KeyvSqlite({ uri: "sqlite://:memory:", wal: true });
		// Wait for the database to initialize (the warning happens during initialization).
		await keyv.query("SELECT 1");
		expect(warnSpy).toHaveBeenCalledWith(
			"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
		);
		warnSpy.mockRestore();
		await keyv.disconnect();
	});
});

describe("schema migration", () => {
	test("should migrate an old schema that lacks the namespace column", async () => {
		const dbPath = "test/testdb-migration.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const oldKey = faker.string.uuid();
		const oldVal = faker.lorem.word();
		const newKey = faker.string.uuid();
		const newVal = faker.lorem.word();

		// Create a database with the old schema (no namespace/expires columns).
		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		db.exec("CREATE TABLE keyv(key VARCHAR(255) PRIMARY KEY, value TEXT)");
		db.prepare("INSERT INTO keyv (key, value) VALUES (?, ?)").run(oldKey, oldVal);
		db.close();

		// Open with the new adapter — should trigger migration.
		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		// Old data should be preserved.
		expect(await keyv.get(oldKey)).toBe(oldVal);
		// New features should work.
		await keyv.set(newKey, newVal);
		expect(await keyv.get(newKey)).toBe(newVal);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});

	test("should split v5 namespaced keys into key and namespace columns", async () => {
		const dbPath = "test/testdb-migration-ns.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const prefixNs = faker.string.alphanumeric(8);
		const prefixKey = faker.string.alphanumeric(8);
		const prefixVal = faker.lorem.word();
		const nestedNs = faker.string.alphanumeric(8);
		const nestedKey = `${faker.string.alphanumeric(6)}:${faker.string.alphanumeric(6)}`;
		const nestedVal = faker.lorem.word();
		const plainKey = faker.string.alphanumeric(10);
		const plainVal = faker.lorem.word();

		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		db.exec("CREATE TABLE keyv(key VARCHAR(255) PRIMARY KEY, value TEXT)");
		db.prepare("INSERT INTO keyv (key, value) VALUES (?, ?)").run(
			`${prefixNs}:${prefixKey}`,
			prefixVal,
		);
		db.prepare("INSERT INTO keyv (key, value) VALUES (?, ?)").run(
			`${nestedNs}:${nestedKey}`,
			nestedVal,
		);
		db.prepare("INSERT INTO keyv (key, value) VALUES (?, ?)").run(plainKey, plainVal);
		db.close();

		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		expect(await keyv.get(plainKey)).toBe(plainVal);

		keyv.namespace = prefixNs;
		expect(await keyv.get(`${prefixNs}:${prefixKey}`)).toBe(prefixVal);

		keyv.namespace = nestedNs;
		expect(await keyv.get(`${nestedNs}:${nestedKey}`)).toBe(nestedVal);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});

	test("should recover a leftover _migration_old table from an interrupted migration", async () => {
		const dbPath = "test/testdb-migration-leftover.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const namespace = faker.string.alphanumeric(8);
		const legacyKey = faker.string.alphanumeric(8);
		const keptValue = faker.lorem.word();

		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		// Simulate a crash after RENAME + CREATE but before INSERT/DROP.
		db.exec("CREATE TABLE keyv_migration_old(key VARCHAR(255) PRIMARY KEY, value TEXT)");
		db.prepare("INSERT INTO keyv_migration_old (key, value) VALUES (?, ?)").run(
			`${namespace}:${legacyKey}`,
			keptValue,
		);
		db.exec(
			"CREATE TABLE keyv(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', expires BIGINT DEFAULT NULL, UNIQUE(key, namespace))",
		);
		db.close();

		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		keyv.namespace = namespace;
		expect(await keyv.get(`${namespace}:${legacyKey}`)).toBe(keptValue);

		const leftover = (await keyv.query(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'keyv_migration_old'",
		)) as unknown[];
		expect(leftover).toHaveLength(0);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});

	test("should recover leftover migration data when the new table is missing", async () => {
		const dbPath = "test/testdb-migration-leftover-missing.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const leftoverKey = faker.string.uuid();
		const leftoverVal = faker.lorem.word();

		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		// Simulate a crash after RENAME but before CREATE.
		db.exec("CREATE TABLE keyv_migration_old(key VARCHAR(255) PRIMARY KEY, value TEXT)");
		db.prepare("INSERT INTO keyv_migration_old (key, value) VALUES (?, ?)").run(
			leftoverKey,
			leftoverVal,
		);
		db.close();

		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		expect(await keyv.get(leftoverKey)).toBe(leftoverVal);
		const leftover = (await keyv.query(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'keyv_migration_old'",
		)) as unknown[];
		expect(leftover).toHaveLength(0);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});

	test("should roll back leftover recovery when the copy fails", async () => {
		const dbPath = "test/testdb-migration-rollback.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		db.exec("CREATE TABLE keyv_migration_old(notkey TEXT)");
		db.exec("INSERT INTO keyv_migration_old (notkey) VALUES ('x')");
		db.exec(
			"CREATE TABLE keyv(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', expires BIGINT DEFAULT NULL, UNIQUE(key, namespace))",
		);
		db.close();

		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		await expect(keyv.ready).rejects.toThrow();

		const leftoverDb = new Database(dbPath);
		const leftover = leftoverDb
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'keyv_migration_old'",
			)
			.all();
		expect(leftover).toHaveLength(1);
		leftoverDb.close();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});

	test("should migrate a schema that has namespace but lacks the expires column", async () => {
		const dbPath = "test/testdb-migration2.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		// Create a database with namespace but no expires column.
		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		const existingKey = faker.string.uuid();
		const existingVal = faker.lorem.word();
		db.exec(
			"CREATE TABLE keyv(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', UNIQUE(key, namespace))",
		);
		db.prepare("INSERT INTO keyv (key, value, namespace) VALUES (?, ?, ?)").run(
			existingKey,
			existingVal,
			"",
		);
		db.close();

		// Open with the new adapter — should add the expires column.
		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		expect(await keyv.get(existingKey)).toBe(existingVal);
		// Expires-related features should work.
		const pastExpires = Date.now() - 1000;
		const expiredValue = JSON.stringify({
			value: faker.lorem.word(),
			expires: pastExpires,
		});
		const expiringKey = faker.string.uuid();
		await keyv.set(expiringKey, expiredValue, pastExpires);
		await keyv.clearExpired();
		expect(await keyv.has(expiringKey)).toBe(false);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});
});

describe("SQL injection prevention", () => {
	test("should sanitize a table name with injection characters at construction", async () => {
		const keyv = new KeyvSqlite({
			uri: sqliteUri,
			table: "keyv'; DROP TABLE keyv; --",
			busyTimeout: 3000,
		});
		// Sanitized to "keyvDROPTABLEkeyv" (only alphanumeric characters kept).
		expect(keyv.table).toBe("keyvDROPTABLEkeyv");
		// Operations should work on the sanitized table name.
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.clear();
		await keyv.disconnect();
	});

	test("should sanitize table setter input to prevent post-construction injection", () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri });
		keyv.table = "evil'; DROP TABLE keyv;--";
		// Should be sanitized, not the raw malicious string.
		expect(keyv.table).toBe("evilDROPTABLEkeyv");
	});

	test("should handle a table name that is a SQLite reserved keyword", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, table: "select", busyTimeout: 3000 });
		// escapeIdentifier wraps the name in double quotes, so "select" is safe.
		expect(keyv.table).toBe("select");
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.clear();
		await keyv.disconnect();
	});

	test("should escape a table name containing double quotes", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, table: 'my"table', busyTimeout: 3000 });
		// toTableString strips the double-quote character.
		expect(keyv.table).toBe("mytable");
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.clear();
		await keyv.disconnect();
	});
});

describe("connection", () => {
	test("should reject operations after disconnect", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri });
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		expect(await keyv.get(testKey)).toBeUndefined();
		await keyv.set(testKey, testVal);
		expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.disconnect();
		await expect(async () => keyv.get(testKey)).rejects.toThrow();
	});
});

describe("createKeyv", () => {
	test("should return a Keyv instance backed by KeyvSqlite", () => {
		const keyv = createKeyv(sqliteUri);
		expect(keyv).toBeInstanceOf(Keyv);
	});
});
