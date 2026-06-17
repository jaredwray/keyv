import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { beforeEach, describe, expect, test, vi } from "vitest";
import KeyvSqlite, { createKeyv } from "../src/index.js";

const sqliteUri = "sqlite://test/testdb.sqlite";
const store = () => new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
storageTestSuite(test, store, { ttl: false });

beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

describe("constructor", () => {
	test("sets the uri when constructed with a string", () => {
		const keyv = new KeyvSqlite(sqliteUri);
		expect(keyv.uri).toBe(sqliteUri);
	});

	test("returns default property values", async () => {
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

	test("returns constructor-provided property values", async () => {
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

	test("returns all configured property values", () => {
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

	test("respects the namespaceLength option", () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, namespaceLength: 128 });
		expect(keyv.namespaceLength).toBe(128);
	});

	test("treats keyLength as an alias for keySize", () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, keyLength: 512 });
		expect(keyv.keySize).toBe(512);
		expect(keyv.keyLength).toBe(512);
	});

	test("sanitizes numeric, alphabetic, and special-character table names", () => {
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

	test("throws for invalid keySize values", () => {
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

	test("accepts valid keySize values", () => {
		expect(new KeyvSqlite({ uri: sqliteUri, keySize: 100 }).keySize).toBe(100);
		expect(new KeyvSqlite({ uri: sqliteUri, keySize: 65535 }).keySize).toBe(65535);
		expect(new KeyvSqlite({ uri: sqliteUri, keySize: 1 }).keySize).toBe(1);
	});

	test("uses default values when the options object omits uri", async () => {
		const keyv = new KeyvSqlite({ table: "no_uri" });
		expect(keyv.uri).toBe("sqlite://:memory:");
		expect(keyv.db).toBe(":memory:");
		expect(keyv.table).toBe("no_uri");
		await keyv.disconnect();
	});
});

describe("property setters", () => {
	test("table setter sanitizes the table name", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		keyv.table = "my_table";
		expect(keyv.table).toBe("my_table");
		keyv.table = '3bad"name';
		expect(keyv.table).toBe("_3badname");
		await keyv.disconnect();
	});

	test("keySize setter updates the value", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.keySize).toBe(255);
		keyv.keySize = 512;
		expect(keyv.keySize).toBe(512);
		await keyv.disconnect();
	});

	test("namespaceLength setter updates the value", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.namespaceLength).toBe(255);
		keyv.namespaceLength = 128;
		expect(keyv.namespaceLength).toBe(128);
		await keyv.disconnect();
	});

	test("iterationLimit setter updates the value", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		expect(keyv.iterationLimit).toBe(10);
		keyv.iterationLimit = 99;
		expect(keyv.iterationLimit).toBe(99);
		await keyv.disconnect();
	});
});

describe("opts", () => {
	test("returns a snapshot of the current configuration", () => {
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
	});
});

describe("get", () => {
	test("returns undefined for a missing key", async () => {
		const keyv = store();
		expect(await keyv.get(faker.string.uuid())).toBeUndefined();
	});

	test("returns undefined (not null) for a key stored with a null value", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		// biome-ignore lint/suspicious/noExplicitAny: testing the null value path
		await keyv.set(key, null as any);
		const result = await keyv.get(key);
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
	});
});

describe("getMany", () => {
	test("returns multiple values in order", async () => {
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

	test("returns undefined (not null) for keys stored with a null value", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		// biome-ignore lint/suspicious/noExplicitAny: testing the null value path
		await keyv.set(key, null as any);
		const results = await keyv.getMany([key, faker.string.uuid()]);
		expect(results).toEqual([undefined, undefined]);
		expect(results[0]).not.toBeNull();
	});

	test("returns undefined for expired keys and deletes them", async () => {
		const keyv = store();
		const expiredKey1 = faker.string.uuid();
		const expiredKey2 = faker.string.uuid();
		const validKey = faker.string.uuid();
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
		await keyv.set(expiredKey1, expiredValue);
		await keyv.set(expiredKey2, expiredValue);
		await keyv.set(validKey, validValue);
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
	test("setMany upserts existing keys", async () => {
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

	test("setMany emits an error and returns false entries on query error", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		let emittedError = false;
		keyv.on("error", () => {
			emittedError = true;
		});
		// Close the connection to force an error.
		await keyv.disconnect();
		const result = await keyv.setMany([
			{ key: "key1", value: "val1" },
			{ key: "key2", value: "val2" },
		]);
		expect(result).toEqual([false, false]);
		expect(emittedError).toBe(true);
	});
});

describe("has and hasMany", () => {
	test("has returns false and deletes an expired key", async () => {
		const keyv = store();
		const key = faker.string.uuid();
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		await keyv.set(key, expiredValue);
		expect(await keyv.has(key)).toBe(false);
		// The expired key should have been deleted.
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("hasMany returns false for expired keys and deletes them", async () => {
		const keyv = store();
		const expiredKey1 = faker.string.uuid();
		const expiredKey2 = faker.string.uuid();
		const validKey = faker.string.uuid();
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
		await keyv.set(expiredKey1, expiredValue);
		await keyv.set(expiredKey2, expiredValue);
		await keyv.set(validKey, validValue);
		const result = await keyv.hasMany([expiredKey1, expiredKey2, validKey]);
		expect(result).toStrictEqual([false, false, true]);
		// The expired keys should have been deleted.
		expect(await keyv.has(expiredKey1)).toBe(false);
		expect(await keyv.has(expiredKey2)).toBe(false);
	});
});

describe("delete and deleteMany", () => {
	test("deleteMany deletes multiple records", async () => {
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

	test("deleteMany returns per-key booleans for existing and missing keys", async () => {
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
	test("removes expired entries and keeps valid ones", async () => {
		const keyv = store();
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		const validValue = JSON.stringify({ value: "current", expires: null });
		const expiredKey = faker.string.uuid();
		const validKey = faker.string.uuid();
		await keyv.set(expiredKey, expiredValue);
		await keyv.set(validKey, validValue);
		// has() already filters expired entries.
		expect(await keyv.has(expiredKey)).toBe(false);
		expect(await keyv.has(validKey)).toBe(true);
		await keyv.clearExpired();
		expect(await keyv.has(expiredKey)).toBe(false);
		expect(await keyv.has(validKey)).toBe(true);
	});

	test("handles object values with an expires field without serialization", async () => {
		const keyv = store();
		const objValue = { value: faker.lorem.word(), expires: Date.now() + 60_000 };
		const objKey = faker.string.uuid();
		// biome-ignore lint/suspicious/noExplicitAny: testing the non-string value path
		await keyv.set(objKey, objValue as any);
		expect(await keyv.has(objKey)).toBe(true);
	});
});

describe("clearExpiredInterval", () => {
	test("automatically cleans up expired entries on the configured schedule", async () => {
		const keyv = new KeyvSqlite({
			uri: sqliteUri,
			busyTimeout: 3000,
			clearExpiredInterval: 100,
		});
		await keyv.clear();
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		const autoExpiredKey = faker.string.uuid();
		await keyv.set(autoExpiredKey, expiredValue);
		// has() already filters expired entries.
		expect(await keyv.has(autoExpiredKey)).toBe(false);
		// Wait for the cleanup timer to fire (which deletes the row entirely).
		await new Promise((resolve) => {
			setTimeout(resolve, 250);
		});
		expect(await keyv.has(autoExpiredKey)).toBe(false);
		await keyv.disconnect();
	});

	test("setter restarts the timer and can disable it", async () => {
		const keyv = store();
		expect(keyv.clearExpiredInterval).toBe(0);
		keyv.clearExpiredInterval = 500;
		expect(keyv.clearExpiredInterval).toBe(500);
		// Reset to 0 to disable.
		keyv.clearExpiredInterval = 0;
		expect(keyv.clearExpiredInterval).toBe(0);
		await keyv.disconnect();
	});
});

describe("namespace", () => {
	test("stores the namespace separately from the key", async () => {
		const storeA = store();
		const storeB = store();
		storeA.namespace = "nsA";
		storeB.namespace = "nsB";

		await storeA.clear();
		await storeB.clear();

		// Same key, different namespaces.
		const nsKey = faker.string.uuid();
		const valA = faker.lorem.word();
		const valB = faker.lorem.word();
		await storeA.set(`nsA:${nsKey}`, valA);
		await storeB.set(`nsB:${nsKey}`, valB);

		expect(await storeA.get(`nsA:${nsKey}`)).toBe(valA);
		expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

		// Clearing one namespace should not affect the other.
		await storeA.clear();
		expect(await storeA.get(`nsA:${nsKey}`)).toBeUndefined();
		expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

		await storeB.clear();
	});

	test("isolates data across multiple Keyv instances", async () => {
		const keyvA = new Keyv({ store: store(), namespace: "ns1" });
		const keyvB = new Keyv({ store: store(), namespace: "ns2" });

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
	test("iterates over a single element", async () => {
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

	test("iterates over multiple elements", async () => {
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

	test("iterates over multiple elements with an iterationLimit of 1", async () => {
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

	test("returns no entries when the store is empty (no namespace passed)", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000, iterationLimit: 1 });
		await keyv.clear();
		const iterator = keyv.iterator();
		const entry = await iterator.next();
		expect(entry.value).toBeUndefined();
		expect(entry.done).toBe(true);
	});

	test("iterates using the configured namespace without passing it to iterator()", async () => {
		const keyv = store();
		keyv.namespace = "iter-ns";
		await keyv.clear();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await keyv.set(`iter-ns:${key1}`, val1);
		await keyv.set(`iter-ns:${key2}`, val2);

		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.size).toBe(2);
		expect(collected.get(key1)).toBe(val1);
		expect(collected.get(key2)).toBe(val2);
		await keyv.clear();
	});

	test("falls back to the default limit when iterationLimit is 0", async () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri, busyTimeout: 3000, iterationLimit: 0 });
		keyv.namespace = "zero-limit-ns";
		await keyv.clear();
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await keyv.set(`zero-limit-ns:${key}`, val);

		const keys: string[] = [];
		for await (const [k] of keyv.iterator()) {
			keys.push(k);
		}

		expect(keys).toContain(key);
		await keyv.clear();
	});
});

describe("events", () => {
	test("exposes the hookified event methods", () => {
		const keyv = store();
		expect(typeof keyv.on).toBe("function");
		expect(typeof keyv.once).toBe("function");
		expect(typeof keyv.emit).toBe("function");
	});

	test("emits an error event when an operation fails", async () => {
		const keyv = new KeyvSqlite("sqlite://:memory:");
		const error = await new Promise<unknown>((resolve) => {
			keyv.on("error", (emitted: unknown) => resolve(emitted));
			// Close the connection then trigger an operation to force an error.
			void keyv.disconnect().then(() => keyv.setMany([{ key: "k", value: "v" }]));
		});
		expect(error).toBeInstanceOf(Error);
	});
});

describe("WAL mode", () => {
	test("can be enabled for a file-based database", async () => {
		const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb-wal.sqlite", wal: true });
		const result = (await keyv.query("PRAGMA journal_mode")) as Array<{ journal_mode: string }>;
		expect(result[0].journal_mode).toBe("wal");
		await keyv.disconnect();
	});

	test("is not enabled by default", async () => {
		const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb-nowal.sqlite" });
		const result = (await keyv.query("PRAGMA journal_mode")) as Array<{ journal_mode: string }>;
		expect(result[0].journal_mode).not.toBe("wal");
		await keyv.disconnect();
	});

	test("is ignored for an in-memory database but operations still work", async () => {
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

	test("logs a warning for an in-memory database", async () => {
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
	test("migrates an old schema that lacks the namespace column", async () => {
		const dbPath = "test/testdb-migration.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		// Create a database with the old schema (no namespace/expires columns).
		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		db.exec("CREATE TABLE keyv(key VARCHAR(255) PRIMARY KEY, value TEXT)");
		db.prepare("INSERT INTO keyv (key, value) VALUES (?, ?)").run("oldkey", "oldval");
		db.close();

		// Open with the new adapter — should trigger migration.
		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		// Old data should be preserved.
		expect(await keyv.get("oldkey")).toBe("oldval");
		// New features should work.
		await keyv.set("newkey", "newval");
		expect(await keyv.get("newkey")).toBe("newval");
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});

	test("migrates a schema that has namespace but lacks the expires column", async () => {
		const dbPath = "test/testdb-migration2.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		// Create a database with namespace but no expires column.
		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		db.exec(
			"CREATE TABLE keyv(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', UNIQUE(key, namespace))",
		);
		db.prepare("INSERT INTO keyv (key, value, namespace) VALUES (?, ?, ?)").run("k1", "v1", "");
		db.close();

		// Open with the new adapter — should add the expires column.
		const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
		expect(await keyv.get("k1")).toBe("v1");
		// Expires-related features should work.
		const expiredValue = JSON.stringify({ value: "temp", expires: Date.now() - 1000 });
		await keyv.set("expiring", expiredValue);
		await keyv.clearExpired();
		expect(await keyv.has("expiring")).toBe(false);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	});
});

describe("SQL injection prevention", () => {
	test("sanitizes a table name with injection characters at construction", async () => {
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

	test("table setter sanitizes input to prevent post-construction injection", () => {
		const keyv = new KeyvSqlite({ uri: sqliteUri });
		keyv.table = "evil'; DROP TABLE keyv;--";
		// Should be sanitized, not the raw malicious string.
		expect(keyv.table).toBe("evilDROPTABLEkeyv");
	});

	test("handles a table name that is a SQLite reserved keyword", async () => {
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

	test("escapes a table name containing double quotes", async () => {
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
	test("rejects operations after disconnect", async () => {
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
	test("returns a Keyv instance backed by KeyvSqlite", () => {
		const keyv = createKeyv(sqliteUri);
		expect(keyv).toBeInstanceOf(Keyv);
	});
});
