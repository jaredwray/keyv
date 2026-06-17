import { faker } from "@faker-js/faker";
import { delay, keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import type mysql from "mysql2";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvMysql, { createKeyv } from "../src/index.js";
import { parseConnectionString } from "../src/pool.js";

const uri = "mysql://root@localhost:3306/keyv_test";

const store = () => new KeyvMysql({ uri, iterationLimit: 2 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
storageTestSuite(test, store, { ttl: false });

beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

describe("constructor", () => {
	test("sets default properties", () => {
		const keyv = new KeyvMysql(uri);
		expect(keyv.uri).toBe(uri);
		expect(keyv.table).toBe("keyv");
		expect(keyv.keyLength).toBe(255);
		expect(keyv.namespaceLength).toBe(255);
		expect(keyv.iterationLimit).toBe(10);
		expect(keyv.intervalExpiration).toBeUndefined();
		expect(keyv.namespace).toBeUndefined();
	});

	test("sets properties from constructor options", () => {
		const keyv = new KeyvMysql({
			uri,
			table: "custom_table",
			keyLength: 512,
			namespaceLength: 128,
			iterationLimit: 50,
		});
		expect(keyv.uri).toBe(uri);
		expect(keyv.table).toBe("custom_table");
		expect(keyv.keyLength).toBe(512);
		expect(keyv.namespaceLength).toBe(128);
		expect(keyv.iterationLimit).toBe(50);
	});

	test("sets the uri when a string is passed", () => {
		const keyv = new KeyvMysql(uri);
		expect(keyv.uri).toBe(uri);
		expect(keyv.table).toBe("keyv");
	});

	test("updates properties via setters", () => {
		const keyv = new KeyvMysql(uri);
		keyv.uri = "mysql://otherhost";
		expect(keyv.uri).toBe("mysql://otherhost");
		keyv.table = "updated_table";
		expect(keyv.table).toBe("updated_table");
		keyv.keyLength = 1024;
		expect(keyv.keyLength).toBe(1024);
		keyv.namespaceLength = 128;
		expect(keyv.namespaceLength).toBe(128);
		keyv.iterationLimit = 100;
		expect(keyv.iterationLimit).toBe(100);
		keyv.intervalExpiration = 30;
		expect(keyv.intervalExpiration).toBe(30);
		keyv.namespace = "test-ns";
		expect(keyv.namespace).toBe("test-ns");
		keyv.namespace = undefined;
		expect(keyv.namespace).toBeUndefined();
	});
});

describe("get", () => {
	test("returns undefined for a missing key", async () => {
		const keyv = new KeyvMysql(uri);
		expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
	});

	test("returns a previously set value", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("returns undefined (not null) for a key stored with a null value", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, null);
		const result = await keyv.get(key);
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
	});
});

describe("getMany", () => {
	test("returns undefined (not null) for keys stored with a null value", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, null);
		const results = await keyv.getMany([key, faker.string.alphanumeric(10)]);
		expect(results).toEqual([undefined, undefined]);
		expect(results[0]).not.toBeNull();
	});
});

describe("set and setMany", () => {
	test("setMany updates existing keys", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "original");
		await keyv.setMany([{ key, value: "updated" }]);
		expect(await keyv.get(key)).toBe("updated");
	});

	test("setMany emits an error and returns false entries on query error", async () => {
		const keyv = new KeyvMysql(uri);
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
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		await keyv.set(key, expiredValue);
		expect(await keyv.has(key)).toBe(false);
		// The expired key should have been deleted.
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("hasMany returns false for expired keys and deletes them", async () => {
		const keyv = new KeyvMysql(uri);
		const expiredKey1 = faker.string.alphanumeric(10);
		const expiredKey2 = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const expiredValue = JSON.stringify({ value: "old", expires: Date.now() - 1000 });
		const validValue = JSON.stringify({ value: "fresh", expires: Date.now() + 60_000 });
		await keyv.set(expiredKey1, expiredValue);
		await keyv.set(expiredKey2, expiredValue);
		await keyv.set(validKey, validValue);
		const result = await keyv.hasMany([expiredKey1, expiredKey2, validKey]);
		expect(result).toStrictEqual([false, false, true]);
		// The expired keys should have been deleted.
		expect(await keyv.get(expiredKey1)).toBeUndefined();
		expect(await keyv.get(expiredKey2)).toBeUndefined();
	});
});

describe("SQL injection prevention", () => {
	test("has prevents a DROP TABLE injection", async () => {
		const keyv = new KeyvMysql(uri);
		const safeKey = faker.string.alphanumeric(10);
		await keyv.set(safeKey, "value");
		expect(await keyv.has("'; DROP TABLE keyv; --")).toBe(false);
		// The table and the safe key should still be intact.
		expect(await keyv.has(safeKey)).toBe(true);
	});

	test("has handles keys with single quotes", async () => {
		const keyv = new KeyvMysql(uri);
		const keyWithQuote = "key'with'quotes";
		await keyv.set(keyWithQuote, "value");
		expect(await keyv.has(keyWithQuote)).toBe(true);
	});

	test("has prevents an OR-condition injection", async () => {
		const keyv = new KeyvMysql(uri);
		const realKey = faker.string.alphanumeric(10);
		await keyv.set(realKey, "value");
		expect(await keyv.has("nonexistent' OR '1'='1")).toBe(false);
	});

	test("has handles keys with special SQL characters", async () => {
		const keyv = new KeyvMysql(uri);
		const specialKeys = [
			"key;with;semicolon",
			"key--with--dashes",
			"key/*comment*/",
			"key\\with\\backslash",
		];
		for (const key of specialKeys) {
			await keyv.set(key, "value");
			expect(await keyv.has(key)).toBe(true);
		}

		expect(await keyv.has("nonexistent;key")).toBe(false);
	});

	test("has prevents a UNION-based injection", async () => {
		const keyv = new KeyvMysql(uri);
		expect(await keyv.has("' UNION SELECT 1 --")).toBe(false);
	});
});

describe("clear", () => {
	test("returns undefined with the default namespace", async () => {
		const keyv = new KeyvMysql(uri);
		expect(await keyv.clear()).toBeUndefined();
	});
});

describe("clearExpired", () => {
	test("removes expired entries and keeps valid ones", async () => {
		const keyv = new KeyvMysql(uri);
		const expiredKey = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const noExpiryKey = faker.string.alphanumeric(10);
		const expired = JSON.stringify({ value: "old", expires: 1 });
		const valid = JSON.stringify({ value: "new", expires: 9999999999999 });
		const noExpiry = JSON.stringify({ value: "forever" });
		await keyv.set(expiredKey, expired);
		await keyv.set(validKey, valid);
		await keyv.set(noExpiryKey, noExpiry);
		await keyv.clearExpired();
		expect(await keyv.get(expiredKey)).toBeUndefined();
		expect(await keyv.get(validKey)).toBe(valid);
		expect(await keyv.get(noExpiryKey)).toBe(noExpiry);
	});

	test("is a no-op when no entries are expired", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const valid = JSON.stringify({ value: "bar", expires: 9999999999999 });
		await keyv.set(key, valid);
		await keyv.clearExpired();
		expect(await keyv.get(key)).toBe(valid);
	});
});

describe("expires column", () => {
	test("set extracts and stores expires from the value", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const valueWithExpires = JSON.stringify({ value: "bar", expires: 9999999999999 });
		await keyv.set(key, valueWithExpires);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(Number(rows[0].expires)).toBe(9999999999999);
	});

	test("set stores null expires when the value has no expires field", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "plain string value");
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(rows[0].expires).toBeNull();
	});

	test("set updates the expires column on upsert", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, JSON.stringify({ value: "bar", expires: 1000 }));
		const rows1 = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(Number(rows1[0].expires)).toBe(1000);
		await keyv.set(key, JSON.stringify({ value: "bar", expires: 2000 }));
		const rows2 = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(Number(rows2[0].expires)).toBe(2000);
	});

	test("setMany extracts and stores expires for each entry", async () => {
		const keyv = new KeyvMysql(uri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await keyv.setMany([
			{ key: key1, value: JSON.stringify({ value: "a", expires: 5000 }) },
			{ key: key2, value: JSON.stringify({ value: "b" }) },
		]);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT id, expires FROM \`keyv\` WHERE id IN ('${key1}', '${key2}') AND namespace = ''`,
		);
		const row1 = rows.find((r) => r.id === key1);
		const row2 = rows.find((r) => r.id === key2);
		expect(Number(row1?.expires)).toBe(5000);
		expect(row2?.expires).toBeNull();
	});

	test("set stores null expires when the value is a number", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, 42);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(rows[0].expires).toBeNull();
	});

	test("set stores null expires when the value is null", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, null);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(rows[0].expires).toBeNull();
	});

	test("is populated when using Keyv core with a TTL", async () => {
		const keyvMysql = new KeyvMysql(uri);
		const keyv = new Keyv({ store: keyvMysql });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value, 60_000);
		const rows = await keyvMysql.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(rows[0].expires).not.toBeNull();
		const expires = Number(rows[0].expires);
		const now = Date.now();
		expect(expires).toBeGreaterThan(now);
		expect(expires).toBeLessThanOrEqual(now + 60_000 + 1000);
	});
});

describe("intervalExpiration", () => {
	test("deletes expired keys on the configured schedule", async () => {
		const keyvMysql = new KeyvMysql({ uri, intervalExpiration: 1 });
		const keyv = new Keyv({ store: keyvMysql });
		const key1 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		// key1 has a 2s ttl; key2 has no ttl (infinite).
		await keyv.set(key1, val1, 2000);
		await keyv.set(key2, val2);
		expect(await keyv.get(key1)).toBe(val1);
		await delay(2500);
		expect(await keyv.get(key1)).toBeUndefined();
		expect(await keyv.get(key2)).toBe(val2);
	});
});

describe("namespace", () => {
	test("stores the same key independently across namespaces", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		expect(await mysql1.get(`${ns1}:${key}`)).toBe(val1);
		expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("stores and retrieves with the default namespace", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("clear only affects the configured namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		await mysql1.clear();

		expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("delete is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		expect(await mysql1.delete(`${ns1}:${key}`)).toBe(true);
		expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("deleteMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		expect(await mysql1.deleteMany([`${ns1}:${key}`])).toEqual([true]);
		expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
		expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
	});

	test("has is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val);

		expect(await mysql1.has(`${ns1}:${key}`)).toBe(true);
		// ns2 should not see ns1's key.
		expect(await mysql2.has(`${ns2}:${key}`)).toBe(false);
	});

	test("hasMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		expect(await mysql1.hasMany([`${ns1}:${key}`])).toEqual([true]);
		expect(await mysql1.hasMany([`${ns2}:${key}`])).toEqual([false]);
	});

	test("getMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		expect(await mysql1.getMany([`${ns1}:${key}`])).toEqual([val1]);
		expect(await mysql1.getMany([`${ns2}:${key}`])).toEqual([undefined]);
	});

	test("setMany is scoped to the namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.setMany([
			{ key: `${ns1}:${key1}`, value: val1 },
			{ key: `${ns1}:${key2}`, value: val2 },
		]);

		expect(await mysql1.get(`${ns1}:${key1}`)).toBe(val1);
		expect(await mysql1.get(`${ns1}:${key2}`)).toBe(val2);
		// ns2 should not see ns1's keys.
		expect(await mysql2.get(`${ns2}:${key1}`)).toBeUndefined();
	});

	test("two Keyv instances with different namespaces do not conflict", async () => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const keyvA = new Keyv({ store: new KeyvMysql(uri), namespace: nsA });
		const keyvB = new Keyv({ store: new KeyvMysql(uri), namespace: nsB });

		const key = faker.string.alphanumeric(10);
		const valA = faker.string.alphanumeric(10);
		const valB = faker.string.alphanumeric(10);
		expect(await keyvA.set(key, valA)).toBe(true);
		expect(await keyvA.get(key)).toBe(valA);
		expect(await keyvB.set(key, valB)).toBe(true);
		expect(await keyvB.get(key)).toBe(valB);
		// Ensure they didn't overwrite each other.
		expect(await keyvA.get(key)).toBe(valA);
	});
});

describe("iterator", () => {
	test("iterates over the default namespace", async () => {
		const keyv = new KeyvMysql(uri);
		await keyv.clear();
		const key1 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.get(key1)).toBe(val1);
		expect(collected.get(key2)).toBe(val2);
	});

	test("iterates over a configured namespace without passing it to iterator()", async () => {
		const ns = faker.string.alphanumeric(8);
		const keyv = new KeyvMysql(uri);
		keyv.namespace = ns;
		const key1 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);
		const collected = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			collected.set(key, value);
		}

		expect(collected.size).toBe(3);
		expect(collected.get(key1)).toBe(val1);
		expect(collected.get(key2)).toBe(val2);
		expect(collected.get(key3)).toBe(val3);
	});

	test("only yields keys from the configured namespace", async () => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql(uri);
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql(uri);
		mysql2.namespace = ns2;

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await mysql1.set(key1, "val1");
		await mysql1.set(key2, "val2");
		await mysql2.set(key3, "val3");

		const keys: string[] = [];
		for await (const [key] of mysql1.iterator()) {
			keys.push(key);
		}

		expect(keys.length).toBe(2);
		expect(keys).toContain(key1);
		expect(keys).toContain(key2);
	});
});

describe("disconnect", () => {
	test("closes the connection", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		expect(await keyv.get(key)).toBeUndefined();
		await keyv.disconnect();
		await expect(keyv.get(key)).rejects.toBeDefined();
	});
});

describe("connection string", () => {
	const connectionSamples = [
		{
			username: "root",
			password: "password",
			host: "localhost",
			port: 3306,
			database: "keyv_dbname",
		},
		{
			username: "root",
			password: "password",
			host: "127.0.0.1",
			port: 3306,
			database: "keyv_dbname",
		},
		{
			username: "test user",
			password: "very strong pass-word",
			host: "test-stg-cluster.cluster-hqpowufs.ap-dqhowd-1.rds.amazonaws.com",
			port: 5006,
			database: "keyv_dbname",
		},
		{
			// Special characters
			username: "John Noêl",
			password: "f.[;@4IWS0,vv)X-dDe FLn+Ün",
			host: "[::1]",
			port: 3306,
			database: "keyv_dbname",
		},
		{
			// No password
			username: "nopassword",
			host: "[::1]",
			port: 3306,
			database: "keyv_dbname",
		},
		{
			// No port
			username: "noport",
			password: "f.[;@4IWS0,vv)X-dDe#Ln+Ün",
			host: "[::1]",
			database: "keyv_dbname",
		},
		{
			// No password & no port
			username: "nopasswordnoport",
			host: "[::1]",
			database: "tablau-èdd",
		},
	];

	test("parses connection strings into pool options", () => {
		for (const connection of connectionSamples) {
			const connectionString = `mysql://${connection.username}:${connection.password ?? ""}@${connection.host}:${connection.port ?? ""}/${connection.database}`;
			const parsed = parseConnectionString(connectionString);

			expect(parsed.user).toBe(connection.username);
			expect(parsed.password).toBe(connection.password);
			expect(parsed.host).toBe(connection.host);
			expect(parsed.port).toBe(connection.port);
			expect(parsed.database).toBe(connection.database);
		}
	});
});

describe("createKeyv", () => {
	test("returns a Keyv instance from a uri string", async () => {
		const keyv = createKeyv(uri);
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("returns a Keyv instance from an options object", async () => {
		const keyv = createKeyv({ uri, table: "keyv" });
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});
});
