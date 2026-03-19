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

test.it("keyLength alias works for keySize", (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		keyLength: 512,
	});
	t.expect(keyv.opts.keySize).toBe(512);
	t.expect(keyv.opts.keyLength).toBe(512);
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

test.it("WAL mode with in-memory database logs a warning", async (t) => {
	const warnSpy = test.vi.spyOn(console, "warn").mockImplementation(() => {});

	const keyv = new KeyvSqlite({
		uri: "sqlite://:memory:",
		wal: true,
	});

	// Wait for the database to initialize (the warn happens during initialization)
	await keyv.query("SELECT 1");

	t.expect(warnSpy).toHaveBeenCalledWith(
		"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
	);

	warnSpy.mockRestore();
	await keyv.disconnect();
});

// --- New feature tests ---

test.it("setMany will set multiple records at once", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.setMany([
		{ key: "a", value: "1" },
		{ key: "b", value: "2" },
		{ key: "c", value: "3" },
	]);
	const values = await keyv.getMany(["a", "b", "c"]);
	t.expect(values).toStrictEqual(["1", "2", "3"]);
});

test.it("setMany with empty array does nothing", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.setMany([]);
	const iterator = keyv.iterator();
	const result = await iterator.next();
	t.expect(result.done).toBe(true);
});

test.it("setMany upserts existing keys", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.set("a", "old");
	await keyv.setMany([
		{ key: "a", value: "new" },
		{ key: "b", value: "2" },
	]);
	t.expect(await keyv.get("a")).toBe("new");
	t.expect(await keyv.get("b")).toBe("2");
});

test.it("hasMany checks multiple keys", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	await keyv.set("a", "1");
	await keyv.set("c", "3");
	const results = await keyv.hasMany(["a", "b", "c"]);
	t.expect(results).toStrictEqual([true, false, true]);
});

test.it("hasMany with no existing keys returns all false", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	const results = await keyv.hasMany(["x", "y", "z"]);
	t.expect(results).toStrictEqual([false, false, false]);
});

test.it("clearExpired removes expired entries", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	// Set an entry with an already-expired timestamp
	const expiredValue = JSON.stringify({
		value: "old",
		expires: Date.now() - 1000,
	});
	const validValue = JSON.stringify({ value: "current", expires: null });
	await keyv.set("expired-key", expiredValue);
	await keyv.set("valid-key", validValue);
	t.expect(await keyv.has("expired-key")).toBe(true);
	t.expect(await keyv.has("valid-key")).toBe(true);
	await keyv.clearExpired();
	t.expect(await keyv.has("expired-key")).toBe(false);
	t.expect(await keyv.has("valid-key")).toBe(true);
});

test.it("clearExpiredInterval auto-cleans expired entries", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		clearExpiredInterval: 100,
	});
	await keyv.clear();
	const expiredValue = JSON.stringify({
		value: "old",
		expires: Date.now() - 1000,
	});
	await keyv.set("auto-expired", expiredValue);
	t.expect(await keyv.has("auto-expired")).toBe(true);
	// Wait for the cleanup timer to fire
	await new Promise((resolve) => {
		setTimeout(resolve, 250);
	});
	t.expect(await keyv.has("auto-expired")).toBe(false);
	await keyv.disconnect();
});

test.it("clearExpiredInterval setter restarts timer", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	t.expect(keyv.clearExpiredInterval).toBe(0);
	keyv.clearExpiredInterval = 500;
	t.expect(keyv.clearExpiredInterval).toBe(500);
	// Reset to 0 to disable
	keyv.clearExpiredInterval = 0;
	t.expect(keyv.clearExpiredInterval).toBe(0);
	await keyv.disconnect();
});

test.it("namespace column stores namespace separately from key", async (t) => {
	const storeA = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	const storeB = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	storeA.namespace = "nsA";
	storeB.namespace = "nsB";

	await storeA.clear();
	await storeB.clear();

	// Same key, different namespaces
	await storeA.set("nsA:key1", "valueA");
	await storeB.set("nsB:key1", "valueB");

	t.expect(await storeA.get("nsA:key1")).toBe("valueA");
	t.expect(await storeB.get("nsB:key1")).toBe("valueB");

	// Clear one namespace should not affect the other
	await storeA.clear();
	t.expect(await storeA.get("nsA:key1")).toBe(undefined);
	t.expect(await storeB.get("nsB:key1")).toBe("valueB");

	await storeB.clear();
});

test.it("namespaceLength option is respected", (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		namespaceLength: 128,
	});
	t.expect(keyv.opts.namespaceLength).toBe(128);
});

test.it("opts getter returns all options", (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		keySize: 512,
		namespaceLength: 128,
		busyTimeout: 5000,
		iterationLimit: 50,
		wal: false,
		clearExpiredInterval: 1000,
	});
	const opts = keyv.opts;
	t.expect(opts.uri).toBe("sqlite://test/testdb.sqlite");
	t.expect(opts.keySize).toBe(512);
	t.expect(opts.keyLength).toBe(512);
	t.expect(opts.namespaceLength).toBe(128);
	t.expect(opts.busyTimeout).toBe(5000);
	t.expect(opts.iterationLimit).toBe(50);
	t.expect(opts.wal).toBe(false);
	t.expect(opts.clearExpiredInterval).toBe(1000);
	t.expect(opts.dialect).toBe("sqlite");
});

test.it("deleteMany returns false when no keys exist", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	const result = await keyv.deleteMany(["nonexistent1", "nonexistent2"]);
	t.expect(result).toBe(false);
});

test.it("has returns false for non-existent key", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	t.expect(await keyv.has("nonexistent")).toBe(false);
});

test.it("migrates old schema that lacks namespace column", async (t) => {
	const dbPath = "test/testdb-migration.sqlite";
	const fs = await import("node:fs");
	// Remove any leftover db
	try {
		fs.unlinkSync(dbPath);
	} catch {}

	// Create a database with the old schema (no namespace/expires columns)
	const sqlite3Module = await import("sqlite3");
	const { promisify } = await import("node:util");
	await new Promise<void>((resolve, reject) => {
		const db = new sqlite3Module.default.Database(dbPath, async (err) => {
			if (err) {
				reject(err);
				return;
			}

			const run = promisify(db.run).bind(db);
			const close = promisify(db.close).bind(db);
			await run("CREATE TABLE keyv(key VARCHAR(255) PRIMARY KEY, value TEXT)");
			await run("INSERT INTO keyv (key, value) VALUES ('oldkey', 'oldval')");
			await close();
			resolve();
		});
	});

	// Open with the new adapter — should trigger migration
	const keyv = new KeyvSqlite({ uri: `sqlite://${dbPath}`, busyTimeout: 3000 });
	// Old data should be preserved
	t.expect(await keyv.get("oldkey")).toBe("oldval");
	// New features should work
	await keyv.set("newkey", "newval");
	t.expect(await keyv.get("newkey")).toBe("newval");
	await keyv.disconnect();

	try {
		fs.unlinkSync(dbPath);
	} catch {}
});

test.it(
	"migrates schema that has namespace but lacks expires column",
	async (t) => {
		const dbPath = "test/testdb-migration2.sqlite";
		const fs = await import("node:fs");
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		// Create a database with namespace but no expires column
		const sqlite3Module = await import("sqlite3");
		const { promisify } = await import("node:util");
		await new Promise<void>((resolve, reject) => {
			const db = new sqlite3Module.default.Database(dbPath, async (err) => {
				if (err) {
					reject(err);
					return;
				}

				const run = promisify(db.run).bind(db);
				const close = promisify(db.close).bind(db);
				await run(
					"CREATE TABLE keyv(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', UNIQUE(key, namespace))",
				);
				await run(
					"INSERT INTO keyv (key, value, namespace) VALUES ('k1', 'v1', '')",
				);
				await close();
				resolve();
			});
		});

		// Open with the new adapter — should add expires column
		const keyv = new KeyvSqlite({
			uri: `sqlite://${dbPath}`,
			busyTimeout: 3000,
		});
		t.expect(await keyv.get("k1")).toBe("v1");
		// Expires-related features should work
		const expiredValue = JSON.stringify({
			value: "temp",
			expires: Date.now() - 1000,
		});
		await keyv.set("expiring", expiredValue);
		await keyv.clearExpired();
		t.expect(await keyv.has("expiring")).toBe(false);
		await keyv.disconnect();

		try {
			fs.unlinkSync(dbPath);
		} catch {}
	},
);

test.it("opts setter updates options", (t) => {
	const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
	keyv.opts = { iterationLimit: 99 };
	t.expect(keyv.opts.iterationLimit).toBe(99);
});

test.it("getExpiresFromValue handles non-string object values", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	// Pass an object value (not a string) with expires — covers the non-string branch
	const objValue = { value: "data", expires: Date.now() + 60000 };
	await keyv.set("objkey", objValue);
	t.expect(await keyv.has("objkey")).toBe(true);
});
