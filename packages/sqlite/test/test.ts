import keyvTestSuite from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvSqlite, { createKeyv } from "../src/index.js";

const store = () =>
	new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite", busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);

test.beforeEach(async () => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
});

test.it("table name can be numeric, alphabet, special case", (t) => {
	let keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		// @ts-expect-error testing
		table: 3000,
	});
	t.expect(keyv.opts.table).toBe("_3000");

	keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: "sample",
	});
	t.expect(keyv.opts.table).toBe("sample");

	// Special characters are now stripped for SQL injection prevention
	keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: "$sample",
	});
	t.expect(keyv.opts.table).toBe("sample");

	// Table name with only special characters should throw
	t.expect(
		() =>
			new KeyvSqlite({
				uri: "sqlite://test/testdb.sqlite",
				table: "$$$",
			}),
	).toThrow("Invalid table name: must contain alphanumeric characters");
});

test.it("keySize validation throws on invalid values", (t) => {
	// Test NaN
	t.expect(
		() =>
			new KeyvSqlite({
				uri: "sqlite://test/testdb.sqlite",
				// @ts-expect-error - testing invalid keySize
				keySize: "invalid",
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test zero
	t.expect(
		() =>
			new KeyvSqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: 0,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test negative
	t.expect(
		() =>
			new KeyvSqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: -100,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test too large
	t.expect(
		() =>
			new KeyvSqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: 70000,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");

	// Test Infinity
	t.expect(
		() =>
			new KeyvSqlite({
				uri: "sqlite://test/testdb.sqlite",
				keySize: Infinity,
			}),
	).toThrow("Invalid keySize: must be a positive number between 1 and 65535");
});

test.it("keySize accepts valid values", (t) => {
	const keyv1 = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 100,
	});
	t.expect(keyv1.opts.keySize).toBe(100);

	const keyv2 = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 65535,
	});
	t.expect(keyv2.opts.keySize).toBe(65535);

	const keyv3 = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 1,
	});
	t.expect(keyv3.opts.keySize).toBe(1);
});

test.it("keyv options as a string", (t) => {
	const uri = "sqlite://test/testdb.sqlite";
	const keyv = new KeyvSqlite(uri);
	t.expect(keyv.opts.uri).toBe(uri);
});

test.it("getMany will return multiple values", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const values = await keyv.getMany(["foo", "foo1", "foo2"]);
	t.expect(values).toStrictEqual(["bar", "bar1", "bar2"]);
});

test.it("deleteMany will delete multiple records", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const values = await keyv.getMany(["foo", "foo1", "foo2"]);
	t.expect(values).toStrictEqual(["bar", "bar1", "bar2"]);
	await keyv.deleteMany(["foo", "foo1", "foo2"]);
	const values1 = await keyv.getMany(["foo", "foo1", "foo2"]);
	t.expect(values1).toStrictEqual([undefined, undefined, undefined]);
});

test.it("Async Iterator single element test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.set("foo", "bar");
	const iterator = keyv.iterator();
	for await (const [key, raw] of iterator) {
		t.expect(key).toBe("foo");
		t.expect(raw).toBe("bar");
	}
});

test.it("Async Iterator multiple element test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 3,
	});
	await keyv.clear();
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const expectedEntries = [
		["foo", "bar"],
		["foo1", "bar1"],
		["foo2", "bar2"],
	];
	const iterator = keyv.iterator();
	let i = 0;
	for await (const [key, raw] of iterator) {
		const [expectedKey, expectedRaw] = expectedEntries[i++];
		t.expect(key).toBe(expectedKey);
		t.expect(raw).toBe(expectedRaw);
	}
});

test.it("Async Iterator multiple elements with limit=1 test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 1,
	});
	await keyv.clear();
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const iterator = keyv.iterator();
	let key = await iterator.next();
	let [k, v] = key.value;
	t.expect(k).toBe("foo");
	t.expect(v).toBe("bar");
	key = await iterator.next();
	[k, v] = key.value;
	t.expect(k).toBe("foo1");
	t.expect(v).toBe("bar1");
	key = await iterator.next();
	[k, v] = key.value;
	t.expect(k).toBe("foo2");
	t.expect(v).toBe("bar2");
});

test.it("Async Iterator 0 element test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 1,
	});
	await keyv.clear();
	const iterator = keyv.iterator("keyv");
	const key = await iterator.next();
	t.expect(key.value).toBe(undefined);
});

test.it("close connection successfully", async (t) => {
	const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
	t.expect(await keyv.get("foo")).toBe(undefined);
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	await keyv.disconnect();
	await t.expect(async () => keyv.get("foo")).rejects.toThrow();
});

test.it("handling namespaces with multiple keyv instances", async (t) => {
	const storeA = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
	const storeB = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
	const keyvA = new Keyv({ store: storeA, namespace: "ns1" });
	const keyvB = new Keyv({ store: storeB, namespace: "ns2" });

	await keyvA.set("a", "x");
	await keyvA.set("b", "y");
	await keyvA.set("c", "z");

	await keyvB.set("a", "one");
	await keyvB.set("b", "two");
	await keyvB.set("c", "three");

	const resultA = await keyvA.get(["a", "b", "c"]);
	const resultB = await keyvB.get(["a", "b", "c"]);

	t.expect(resultA).toStrictEqual(["x", "y", "z"]);
	t.expect(resultB).toStrictEqual(["one", "two", "three"]);

	const iteratorResultA = new Map<string, string>();

	const iterator1 = keyvA.iterator ? keyvA.iterator("ns1") : undefined;
	if (iterator1) {
		for await (const [key, value] of iterator1) {
			iteratorResultA.set(key, value);
		}
	}

	t.expect(iteratorResultA).toStrictEqual(
		new Map([
			["a", "x"],
			["b", "y"],
			["c", "z"],
		]),
	);
});

test.it("will create a Keyv instance with a store", (t) => {
	const keyv = createKeyv("sqlite://test/testdb.sqlite");
	t.expect(keyv).toBeInstanceOf(Keyv);
});

test.it("WAL mode can be enabled", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb-wal.sqlite",
		wal: true,
	});
	const result = await keyv.query("PRAGMA journal_mode");
	t.expect(result[0].journal_mode).toBe("wal");
	await keyv.disconnect();
});

test.it("WAL mode is not enabled by default", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb-nowal.sqlite",
	});
	const result = await keyv.query("PRAGMA journal_mode");
	t.expect(result[0].journal_mode).not.toBe("wal");
	await keyv.disconnect();
});

test.it(
	"WAL mode does not work with in-memory database (remains as memory mode)",
	async (t) => {
		const keyv = new KeyvSqlite({
			uri: "sqlite://:memory:",
			wal: true,
		});
		const result = await keyv.query("PRAGMA journal_mode");
		// In-memory databases cannot use WAL mode, they remain in "memory" journal mode
		t.expect(result[0].journal_mode).toBe("memory");
		// But basic operations should still work
		await keyv.set("test", "value");
		const value = await keyv.get("test");
		t.expect(value).toBe("value");
		await keyv.disconnect();
	},
);
