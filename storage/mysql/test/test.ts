import keyvTestSuite, { delay, keyvIteratorTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvMysql from "../src/index.js";
import { parseConnectionString } from "../src/pool.js";

const uri = "mysql://root@localhost:3306/keyv_test";

const store = () => new KeyvMysql(uri);
keyvTestSuite(test, Keyv, store);
const iteratorStore = () => new KeyvMysql({ uri, iterationLimit: 2 });
keyvIteratorTests(test, Keyv, iteratorStore);

test.beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
	// Clear namespaced entries from native namespace tests
	const ns1 = new KeyvMysql({ uri });
	ns1.namespace = "ns1";
	await ns1.clear();
	const ns2 = new KeyvMysql({ uri });
	ns2.namespace = "ns2";
	await ns2.clear();
	const nsA = new KeyvMysql({ uri });
	nsA.namespace = "namespace-a";
	await nsA.clear();
	const nsB = new KeyvMysql({ uri });
	nsB.namespace = "namespace-b";
	await nsB.clear();
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

test.it(".setMany() sets multiple key-value pairs", async (t) => {
	const keyv = new KeyvMysql(uri);
	await keyv.setMany([
		{ key: "setMany1", value: "value1" },
		{ key: "setMany2", value: "value2" },
		{ key: "setMany3", value: "value3" },
	]);
	t.expect(await keyv.get("setMany1")).toBe("value1");
	t.expect(await keyv.get("setMany2")).toBe("value2");
	t.expect(await keyv.get("setMany3")).toBe("value3");
});

test.it(".setMany() with empty array is a no-op", async (t) => {
	const keyv = new KeyvMysql(uri);
	await t.expect(keyv.setMany([])).resolves.toBeUndefined();
});

test.it(".setMany() updates existing keys", async (t) => {
	const keyv = new KeyvMysql(uri);
	await keyv.set("setManyUpdate", "original");
	await keyv.setMany([{ key: "setManyUpdate", value: "updated" }]);
	t.expect(await keyv.get("setManyUpdate")).toBe("updated");
});

test.it(".hasMany() returns correct boolean array", async (t) => {
	const keyv = new KeyvMysql(uri);
	await keyv.set("hasMany1", "value1");
	await keyv.set("hasMany2", "value2");
	const results = await keyv.hasMany(["hasMany1", "hasMany2", "nonexistent"]);
	t.expect(results).toEqual([true, true, false]);
});

test.it(".hasMany() returns all false for nonexistent keys", async (t) => {
	const keyv = new KeyvMysql(uri);
	const results = await keyv.hasMany(["missing1", "missing2"]);
	t.expect(results).toEqual([false, false]);
});

test.it(".hasMany() with empty array returns empty array", async (t) => {
	const keyv = new KeyvMysql(uri);
	const results = await keyv.hasMany([]);
	t.expect(results).toEqual([]);
});

// Native namespace tests
test.it(
	"native namespace: same key in different namespaces stored independently",
	async (t) => {
		const mysql1 = new KeyvMysql({ uri });
		mysql1.namespace = "ns1";
		const mysql2 = new KeyvMysql({ uri });
		mysql2.namespace = "ns2";

		await mysql1.set("ns1:testkey", "value1");
		await mysql2.set("ns2:testkey", "value2");

		t.expect(await mysql1.get("ns1:testkey")).toBe("value1");
		t.expect(await mysql2.get("ns2:testkey")).toBe("value2");
	},
);

test.it(
	"native namespace: null namespace stores and retrieves correctly",
	async (t) => {
		const keyv = new KeyvMysql({ uri });
		await keyv.set("testkey-no-ns", "testvalue");
		t.expect(await keyv.get("testkey-no-ns")).toBe("testvalue");
	},
);

test.it(
	"native namespace: clear only clears the specified namespace",
	async (t) => {
		const mysql1 = new KeyvMysql({ uri });
		mysql1.namespace = "ns1";
		const mysql2 = new KeyvMysql({ uri });
		mysql2.namespace = "ns2";

		await mysql1.set("ns1:key1", "value1");
		await mysql2.set("ns2:key1", "value2");

		await mysql1.clear();

		t.expect(await mysql1.get("ns1:key1")).toBeUndefined();
		t.expect(await mysql2.get("ns2:key1")).toBe("value2");
	},
);

test.it("native namespace: delete scoped to namespace", async (t) => {
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = "ns1";
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = "ns2";

	await mysql1.set("ns1:key1", "val1");
	await mysql2.set("ns2:key1", "val2");

	const deleted = await mysql1.delete("ns1:key1");
	t.expect(deleted).toBe(true);
	t.expect(await mysql1.get("ns1:key1")).toBeUndefined();
	t.expect(await mysql2.get("ns2:key1")).toBe("val2");
});

test.it("native namespace: deleteMany scoped to namespace", async (t) => {
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = "ns1";
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = "ns2";

	await mysql1.set("ns1:key1", "val1");
	await mysql2.set("ns2:key1", "val2");

	const deleted = await mysql1.deleteMany(["ns1:key1"]);
	t.expect(deleted).toBe(true);
	t.expect(await mysql1.get("ns1:key1")).toBeUndefined();
	t.expect(await mysql2.get("ns2:key1")).toBe("val2");
});

test.it("native namespace: has scoped to namespace", async (t) => {
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = "ns1";
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = "ns2";

	await mysql1.set("ns1:key1", "val1");

	t.expect(await mysql1.has("ns1:key1")).toBe(true);
	// ns2 should not see ns1's key
	t.expect(await mysql2.has("ns2:key1")).toBe(false);
});

test.it("native namespace: hasMany scoped to namespace", async (t) => {
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = "ns1";
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = "ns2";

	await mysql1.set("ns1:key1", "val1");
	await mysql2.set("ns2:key1", "val2");

	const result1 = await mysql1.hasMany(["ns1:key1"]);
	t.expect(result1).toEqual([true]);

	const result2 = await mysql1.hasMany(["ns2:key1"]);
	t.expect(result2).toEqual([false]);
});

test.it(
	"native namespace: iterator only returns keys from correct namespace",
	async (t) => {
		const mysql1 = new KeyvMysql({ uri });
		mysql1.namespace = "ns1";
		const mysql2 = new KeyvMysql({ uri });
		mysql2.namespace = "ns2";

		await mysql1.set("ns1:key1", "val1");
		await mysql1.set("ns1:key2", "val2");
		await mysql2.set("ns2:key3", "val3");

		const keys: string[] = [];
		for await (const [key] of mysql1.iterator("ns1")) {
			keys.push(key);
		}

		t.expect(keys.length).toBe(2);
		t.expect(keys).toContain("ns1:key1");
		t.expect(keys).toContain("ns1:key2");
	},
);

test.it(
	"native namespace: two Keyv instances with different namespaces do not conflict",
	async (t) => {
		const mysqlA = new KeyvMysql({ uri });
		const mysqlB = new KeyvMysql({ uri });
		const keyvA = new Keyv({ store: mysqlA, namespace: "namespace-a" });
		const keyvB = new Keyv({ store: mysqlB, namespace: "namespace-b" });

		t.expect(await keyvA.set("mykey", "valueA")).toBe(true);
		t.expect(await keyvA.get("mykey")).toBe("valueA");
		t.expect(await keyvB.set("mykey", "valueB")).toBe(true);
		t.expect(await keyvB.get("mykey")).toBe("valueB");
		// Ensure they didn't overwrite each other
		t.expect(await keyvA.get("mykey")).toBe("valueA");
	},
);

test.it("native namespace: getMany scoped to namespace", async (t) => {
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = "ns1";
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = "ns2";

	await mysql1.set("ns1:key1", "val1");
	await mysql2.set("ns2:key1", "val2");

	const results = await mysql1.getMany(["ns1:key1"]);
	t.expect(results).toEqual(["val1"]);

	const results2 = await mysql1.getMany(["ns2:key1"]);
	t.expect(results2).toEqual([undefined]);
});

test.it("native namespace: setMany scoped to namespace", async (t) => {
	const mysql1 = new KeyvMysql({ uri });
	mysql1.namespace = "ns1";
	const mysql2 = new KeyvMysql({ uri });
	mysql2.namespace = "ns2";

	await mysql1.setMany([
		{ key: "ns1:key1", value: "val1" },
		{ key: "ns1:key2", value: "val2" },
	]);

	t.expect(await mysql1.get("ns1:key1")).toBe("val1");
	t.expect(await mysql1.get("ns1:key2")).toBe("val2");
	// ns2 should not see ns1's keys
	t.expect(await mysql2.get("ns2:key1")).toBeUndefined();
});
