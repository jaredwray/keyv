import { faker } from "@faker-js/faker";
import keyvTestSuite, { delay, keyvIteratorTests } from "@keyv/test-suite";
import Keyv from "keyv";
import type mysql from "mysql2";
import * as test from "vitest";
import KeyvMysql, { createKeyv } from "../src/index.js";
import { parseConnectionString } from "../src/pool.js";

const uri = "mysql://root@localhost:3306/keyv_test";

const store = () => new KeyvMysql(uri);
keyvTestSuite(test, Keyv, store);
const iteratorStore = () => new KeyvMysql({ uri, iterationLimit: 2 });
keyvIteratorTests(test, Keyv, iteratorStore);

test.it("iterator with explicit namespace", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const keyv = new KeyvMysql({ uri });
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
	for await (const [key, value] of keyv.iterator(ns)) {
		collected.set(key, value);
	}

	t.expect(collected.size).toBe(3);
	t.expect(collected.get(key1)).toBe(val1);
	t.expect(collected.get(key2)).toBe(val2);
	t.expect(collected.get(key3)).toBe(val3);
});

test.it("iterator with default namespace", async (t) => {
	const keyv = new KeyvMysql({ uri });
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

	t.expect(collected.size).toBeGreaterThanOrEqual(2);
	t.expect(collected.get(key1)).toBe(val1);
	t.expect(collected.get(key2)).toBe(val2);
	await keyv.clear();
});

test.it(".clear() with undefined namespace", async (t) => {
	const keyv = store();
	t.expect(await keyv.clear()).toBeUndefined();
});

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

test.it("validate connection strings", (t) => {
	for (const connection of connectionSamples) {
		const newConnectionString = `mysql://${connection.username}:${connection.password ?? ""}@${connection.host}:${connection.port ?? ""}/${connection.database}`;
		const parsedConnection = parseConnectionString(newConnectionString);

		t.expect(parsedConnection.user).toBe(connection.username);
		t.expect(parsedConnection.password).toBe(connection.password);
		t.expect(parsedConnection.host).toBe(connection.host);
		t.expect(parsedConnection.port).toBe(connection.port);
		t.expect(parsedConnection.database).toBe(connection.database);
	}
});

test.it("close connection successfully", async (t) => {
	const keyv = store();
	const key = faker.string.alphanumeric(10);
	t.expect(await keyv.get(key)).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("set intervalExpiration to 1 second", async (t) => {
	const keyvMySql = new KeyvMysql({ uri, intervalExpiration: 1 });
	const keyv = new Keyv({ store: keyvMySql });
	const key1 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	// Ttl: 2s
	await keyv.set(key1, val1, 2000);
	// No ttl -> undefined -> (expires:null) -> infinite
	await keyv.set(key2, val2);
	const value1 = await keyv.get(key1);
	t.expect(value1).toBe(val1);
	await delay(2500);
	const value2 = await keyv.get(key1);
	t.expect(value2).toBeUndefined();
	const value3 = await keyv.get(key2);
	t.expect(value3).toBe(val2);
});

test.it(".has() prevents SQL injection with DROP TABLE", async (t) => {
	const keyv = new KeyvMysql(uri);
	const safeKey = faker.string.alphanumeric(10);
	await keyv.set(safeKey, "value");
	const result = await keyv.has("'; DROP TABLE keyv; --");
	t.expect(result).toBe(false);
	const safeKeyExists = await keyv.has(safeKey);
	t.expect(safeKeyExists).toBe(true);
});

test.it(".has() handles keys with single quotes", async (t) => {
	const keyv = new KeyvMysql(uri);
	const keyWithQuote = "key'with'quotes";
	await keyv.set(keyWithQuote, "value");
	t.expect(await keyv.has(keyWithQuote)).toBe(true);
});

test.it(".has() prevents SQL injection with OR condition", async (t) => {
	const keyv = new KeyvMysql(uri);
	const realKey = faker.string.alphanumeric(10);
	await keyv.set(realKey, "value");
	const result = await keyv.has("nonexistent' OR '1'='1");
	t.expect(result).toBe(false);
});

test.it(".has() handles keys with special SQL characters", async (t) => {
	const keyv = new KeyvMysql(uri);
	const specialKeys = [
		"key;with;semicolon",
		"key--with--dashes",
		"key/*comment*/",
		"key\\with\\backslash",
	];
	for (const key of specialKeys) {
		await keyv.set(key, "value");
		t.expect(await keyv.has(key)).toBe(true);
	}
	t.expect(await keyv.has("nonexistent;key")).toBe(false);
});

test.it(".has() prevents UNION-based SQL injection", async (t) => {
	const keyv = new KeyvMysql(uri);
	const result = await keyv.has("' UNION SELECT 1 --");
	t.expect(result).toBe(false);
});

test.it(".setMany() sets multiple key-value pairs", async (t) => {
	const keyv = new KeyvMysql(uri);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	const val3 = faker.string.alphanumeric(10);
	await keyv.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
		{ key: key3, value: val3 },
	]);
	t.expect(await keyv.get(key1)).toBe(val1);
	t.expect(await keyv.get(key2)).toBe(val2);
	t.expect(await keyv.get(key3)).toBe(val3);
});

test.it(".setMany() with empty array is a no-op", async (t) => {
	const keyv = new KeyvMysql(uri);
	await t.expect(keyv.setMany([])).resolves.toEqual([]);
});

test.it(".setMany() updates existing keys", async (t) => {
	const keyv = new KeyvMysql(uri);
	const key = faker.string.alphanumeric(10);
	await keyv.set(key, "original");
	await keyv.setMany([{ key, value: "updated" }]);
	t.expect(await keyv.get(key)).toBe("updated");
});

test.it(".hasMany() returns correct boolean array", async (t) => {
	const keyv = new KeyvMysql(uri);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const missing = faker.string.alphanumeric(10);
	await keyv.set(key1, "value1");
	await keyv.set(key2, "value2");
	const results = await keyv.hasMany([key1, key2, missing]);
	t.expect(results).toEqual([true, true, false]);
});

test.it(".hasMany() returns all false for nonexistent keys", async (t) => {
	const keyv = new KeyvMysql(uri);
	const missing1 = faker.string.alphanumeric(10);
	const missing2 = faker.string.alphanumeric(10);
	const results = await keyv.hasMany([missing1, missing2]);
	t.expect(results).toEqual([false, false]);
});

test.it(".hasMany() with empty array returns empty array", async (t) => {
	const keyv = new KeyvMysql(uri);
	const results = await keyv.hasMany([]);
	t.expect(results).toEqual([]);
});

// Expires column tests
test.it(
	"set() extracts and stores expires in the expires column",
	async (t) => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const valueWithExpires = JSON.stringify({
			value: "bar",
			expires: 9999999999999,
		});
		await keyv.set(key, valueWithExpires);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		t.expect(Number(rows[0].expires)).toBe(9999999999999);
	},
);

test.it(
	"set() stores null expires when value has no expires field",
	async (t) => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "plain string value");
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		t.expect(rows[0].expires).toBeNull();
	},
);

test.it("set() updates expires column on upsert", async (t) => {
	const keyv = new KeyvMysql(uri);
	const key = faker.string.alphanumeric(10);
	const value1 = JSON.stringify({ value: "bar", expires: 1000 });
	const value2 = JSON.stringify({ value: "bar", expires: 2000 });
	await keyv.set(key, value1);
	const rows1 = await keyv.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(Number(rows1[0].expires)).toBe(1000);
	await keyv.set(key, value2);
	const rows2 = await keyv.query<mysql.RowDataPacket[]>(
		`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
	);
	t.expect(Number(rows2[0].expires)).toBe(2000);
});

test.it("setMany() extracts and stores expires for each entry", async (t) => {
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
	t.expect(Number(row1?.expires)).toBe(5000);
	t.expect(row2?.expires).toBeNull();
});

test.it(
	"clearExpired() removes expired entries and keeps valid ones",
	async (t) => {
		const keyv = new KeyvMysql(uri);
		const expiredKey = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const noExpiryKey = faker.string.alphanumeric(10);
		// Expired entry (timestamp in the past)
		const expired = JSON.stringify({ value: "old", expires: 1 });
		// Valid entry (far future)
		const valid = JSON.stringify({ value: "new", expires: 9999999999999 });
		// No expiry
		const noExpiry = JSON.stringify({ value: "forever" });
		await keyv.set(expiredKey, expired);
		await keyv.set(validKey, valid);
		await keyv.set(noExpiryKey, noExpiry);
		await keyv.clearExpired();
		t.expect(await keyv.get(expiredKey)).toBeUndefined();
		t.expect(await keyv.get(validKey)).toBe(valid);
		t.expect(await keyv.get(noExpiryKey)).toBe(noExpiry);
	},
);

test.it("clearExpired() is a no-op when no entries are expired", async (t) => {
	const keyv = new KeyvMysql(uri);
	const key = faker.string.alphanumeric(10);
	const valid = JSON.stringify({ value: "bar", expires: 9999999999999 });
	await keyv.set(key, valid);
	await keyv.clearExpired();
	t.expect(await keyv.get(key)).toBe(valid);
});

test.it(
	"expires column is populated when using Keyv core with TTL",
	async (t) => {
		const keyvMysql = new KeyvMysql(uri);
		const keyv = new Keyv({ store: keyvMysql });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value, 60_000);
		const rows = await keyvMysql.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		t.expect(rows[0].expires).not.toBeNull();
		// expires should be roughly Date.now() + 60000
		const expires = Number(rows[0].expires);
		const now = Date.now();
		t.expect(expires).toBeGreaterThan(now);
		t.expect(expires).toBeLessThanOrEqual(now + 60_000 + 1000);
	},
);

// Native namespace tests
test.it(
	"native namespace: same key in different namespaces stored independently",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql({ uri });
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql({ uri });
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		t.expect(await mysql1.get(`${ns1}:${key}`)).toBe(val1);
		t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
	},
);

test.it(
	"native namespace: null namespace stores and retrieves correctly",
	async (t) => {
		const keyv = new KeyvMysql({ uri });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	},
);

test.it(
	"native namespace: clear only clears the specified namespace",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql({ uri });
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql({ uri });
		mysql2.namespace = ns2;

		const key = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await mysql1.set(`${ns1}:${key}`, val1);
		await mysql2.set(`${ns2}:${key}`, val2);

		await mysql1.clear();

		t.expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
		t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
	},
);

test.it("native namespace: delete scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const deleted = await mysql1.delete(`${ns1}:${key}`);
	t.expect(deleted).toBe(true);
	t.expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
});

test.it("native namespace: deleteMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const deleted = await mysql1.deleteMany([`${ns1}:${key}`]);
	t.expect(deleted).toEqual([true]);
	t.expect(await mysql1.get(`${ns1}:${key}`)).toBeUndefined();
	t.expect(await mysql2.get(`${ns2}:${key}`)).toBe(val2);
});

test.it("native namespace: has scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val);

	t.expect(await mysql1.has(`${ns1}:${key}`)).toBe(true);
	// ns2 should not see ns1's key
	t.expect(await mysql2.has(`${ns2}:${key}`)).toBe(false);
});

test.it("native namespace: hasMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const result1 = await mysql1.hasMany([`${ns1}:${key}`]);
	t.expect(result1).toEqual([true]);

	const result2 = await mysql1.hasMany([`${ns2}:${key}`]);
	t.expect(result2).toEqual([false]);
});

test.it(
	"native namespace: iterator only returns keys from correct namespace",
	async (t) => {
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const mysql1 = new KeyvMysql({ uri });
		mysql1.namespace = ns1;
		const mysql2 = new KeyvMysql({ uri });
		mysql2.namespace = ns2;

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await mysql1.set(key1, "val1");
		await mysql1.set(key2, "val2");
		await mysql2.set(key3, "val3");

		const keys: string[] = [];
		for await (const [key] of mysql1.iterator(ns1)) {
			keys.push(key);
		}

		t.expect(keys.length).toBe(2);
		t.expect(keys).toContain(key1);
		t.expect(keys).toContain(key2);
	},
);

test.it(
	"native namespace: two Keyv instances with different namespaces do not conflict",
	async (t) => {
		const nsA = faker.string.alphanumeric(8);
		const nsB = faker.string.alphanumeric(8);
		const mysqlA = new KeyvMysql({ uri });
		const mysqlB = new KeyvMysql({ uri });
		const keyvA = new Keyv({ store: mysqlA, namespace: nsA });
		const keyvB = new Keyv({ store: mysqlB, namespace: nsB });

		const key = faker.string.alphanumeric(10);
		const valA = faker.string.alphanumeric(10);
		const valB = faker.string.alphanumeric(10);
		t.expect(await keyvA.set(key, valA)).toBe(true);
		t.expect(await keyvA.get(key)).toBe(valA);
		t.expect(await keyvB.set(key, valB)).toBe(true);
		t.expect(await keyvB.get(key)).toBe(valB);
		// Ensure they didn't overwrite each other
		t.expect(await keyvA.get(key)).toBe(valA);
	},
);

test.it("native namespace: getMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = ns2;

	const key = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.set(`${ns1}:${key}`, val1);
	await mysql2.set(`${ns2}:${key}`, val2);

	const results = await mysql1.getMany([`${ns1}:${key}`]);
	t.expect(results).toEqual([val1]);

	const results2 = await mysql1.getMany([`${ns2}:${key}`]);
	t.expect(results2).toEqual([undefined]);
});

test.it("native namespace: setMany scoped to namespace", async (t) => {
	const ns1 = faker.string.alphanumeric(8);
	const ns2 = faker.string.alphanumeric(8);
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = ns1;
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = ns2;

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await mysql1.setMany([
		{ key: `${ns1}:${key1}`, value: val1 },
		{ key: `${ns1}:${key2}`, value: val2 },
	]);

	t.expect(await mysql1.get(`${ns1}:${key1}`)).toBe(val1);
	t.expect(await mysql1.get(`${ns1}:${key2}`)).toBe(val2);
	// ns2 should not see ns1's keys
	t.expect(await mysql2.get(`${ns2}:${key1}`)).toBeUndefined();
});

// Property getter/setter tests
test.it("properties have correct defaults", (t) => {
	const keyv = new KeyvMysql(uri);
	t.expect(keyv.uri).toBe(uri);
	t.expect(keyv.table).toBe("keyv");
	t.expect(keyv.keyLength).toBe(255);
	t.expect(keyv.namespaceLength).toBe(255);
	t.expect(keyv.iterationLimit).toBe(10);
	t.expect(keyv.intervalExpiration).toBeUndefined();
	t.expect(keyv.namespace).toBeUndefined();
});

test.it("properties are set correctly via constructor options", (t) => {
	const keyv = new KeyvMysql({
		uri,
		table: "custom_table",
		keyLength: 512,
		namespaceLength: 128,
		iterationLimit: 50,
	});
	t.expect(keyv.table).toBe("custom_table");
	t.expect(keyv.keyLength).toBe(512);
	t.expect(keyv.namespaceLength).toBe(128);
	t.expect(keyv.iterationLimit).toBe(50);
});

test.it("property getters return configured values", (t) => {
	const keyv = new KeyvMysql({ uri, table: "custom", keyLength: 512 });
	t.expect(keyv.table).toBe("custom");
	t.expect(keyv.keyLength).toBe(512);
	t.expect(keyv.uri).toBe(uri);
	t.expect(keyv.namespaceLength).toBe(255);
	t.expect(keyv.iterationLimit).toBe(10);
});

test.it("individual property setters work", (t) => {
	const keyv = new KeyvMysql(uri);
	keyv.uri = "mysql://otherhost";
	t.expect(keyv.uri).toBe("mysql://otherhost");
	keyv.table = "updated_table";
	t.expect(keyv.table).toBe("updated_table");
	keyv.keyLength = 1024;
	t.expect(keyv.keyLength).toBe(1024);
	keyv.namespaceLength = 128;
	t.expect(keyv.namespaceLength).toBe(128);
	keyv.iterationLimit = 100;
	t.expect(keyv.iterationLimit).toBe(100);
	keyv.intervalExpiration = 30;
	t.expect(keyv.intervalExpiration).toBe(30);
	keyv.namespace = "test-ns";
	t.expect(keyv.namespace).toBe("test-ns");
});

test.it("iterator on empty store returns nothing", async (t) => {
	const ns = faker.string.alphanumeric(8);
	const keyv = new KeyvMysql(uri);
	keyv.namespace = ns;
	const entries: Array<[string, string]> = [];
	for await (const entry of keyv.iterator(ns)) {
		entries.push(entry);
	}

	t.expect(entries.length).toBe(0);
});

// Non-string value tests (covers getExpiresFromValue else branch)
test.it(
	"set() stores null expires when value is a number (non-string)",
	async (t) => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, 42);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		t.expect(rows[0].expires).toBeNull();
	},
);

test.it(
	"set() stores null expires when value is null (non-string)",
	async (t) => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, null);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		t.expect(rows[0].expires).toBeNull();
	},
);

// createKeyv helper tests

test.it("createKeyv with URI string returns a Keyv instance", async (t) => {
	const keyv = createKeyv(uri);
	t.expect(keyv).toBeInstanceOf(Keyv);
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
});

test.it("setMany returns false entries on query error", async (t) => {
	const store = new KeyvMysql(uri);
	let emittedError = false;
	store.on("error", () => {
		emittedError = true;
	});
	// Close the connection to force an error
	await store.disconnect();
	const result = await store.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	t.expect(emittedError).toBe(true);
});

test.it("createKeyv with options object returns a Keyv instance", async (t) => {
	const keyv = createKeyv({ uri, table: "keyv" });
	t.expect(keyv).toBeInstanceOf(Keyv);
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
});
