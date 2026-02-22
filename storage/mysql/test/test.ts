import keyvTestSuite, { delay, keyvIteratorTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvMysql, { createKeyv } from "../src/index.js";
import { parseConnectionString } from "../src/pool.js";

const uri = "mysql://root@localhost:3306/keyv_test";

const store = () => new KeyvMysql(uri);
keyvTestSuite(test, Keyv, store);
const iteratorStore = () => new KeyvMysql({ uri, iterationLimit: 2 });
keyvIteratorTests(test, Keyv, iteratorStore);

test.beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

test.it("iterator with default namespace", async (t) => {
	const keyv = new KeyvMysql({ uri });
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const iterator = keyv.iterator();
	let entry = await iterator.next();
	t.expect(entry.value[0]).toBe("foo");
	t.expect(entry.value[1]).toBe("bar");
	entry = await iterator.next();
	t.expect(entry.value[0]).toBe("foo1");
	t.expect(entry.value[1]).toBe("bar1");
	entry = await iterator.next();
	t.expect(entry.value[0]).toBe("foo2");
	t.expect(entry.value[1]).toBe("bar2");
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
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
	t.expect(await keyv.get("foo")).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get("foo");
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("set intervalExpiration to 1 second", async (t) => {
	const keyvMySql = new KeyvMysql({ uri, intervalExpiration: 1 });
	const keyv = new Keyv({ store: keyvMySql });
	// Ttl: 1s
	await keyv.set("foo-interval1", "bar-interval1", 1000);
	// No ttl -> undefined -> (expires:null) -> infinite
	await keyv.set("foo-interval-no-ttl", "bar-interval-no-ttl");
	const value1 = await keyv.get("foo-interval1");
	t.expect(value1).toBe("bar-interval1");
	await delay(1100);
	const value2 = await keyv.get("foo-interval1");
	t.expect(value2).toBeUndefined();
	const value3 = await keyv.get("foo-interval-no-ttl");
	t.expect(value3).toBe("bar-interval-no-ttl");
});

test.it(".has() prevents SQL injection with DROP TABLE", async (t) => {
	const keyv = new KeyvMysql(uri);
	await keyv.set("safe-key", "value");
	const result = await keyv.has("'; DROP TABLE keyv; --");
	t.expect(result).toBe(false);
	const safeKeyExists = await keyv.has("safe-key");
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
	await keyv.set("real-key", "value");
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

test.it("createKeyv returns a Keyv instance", async (t) => {
	const keyv = createKeyv(uri);
	t.expect(keyv).toBeInstanceOf(Keyv);
	await keyv.disconnect();
});

test.it("createKeyv with options returns a Keyv instance", async (t) => {
	const keyv = createKeyv({ uri, table: "cache" });
	t.expect(keyv).toBeInstanceOf(Keyv);
	await keyv.disconnect();
});

test.it("constructor with string URI", async (t) => {
	const store = new KeyvMysql(uri);
	t.expect(store.opts.uri).toBe(uri);
	await store.disconnect();
});

test.it("constructor with options object", async (t) => {
	const store = new KeyvMysql({ uri, table: "custom_table", keySize: 512 });
	t.expect(store.opts.uri).toBe(uri);
	t.expect(store.opts.table).toBe("custom_table");
	t.expect(store.opts.keySize).toBe(512);
	await store.disconnect();
});
