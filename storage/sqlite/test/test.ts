import { faker } from "@faker-js/faker";
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
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();
	await keyv.set(key1, val1);
	await keyv.set(key2, val2);
	await keyv.set(key3, val3);
	const values = await keyv.getMany([key1, key2, key3]);
	t.expect(values).toStrictEqual([val1, val2, val3]);
});

test.it("deleteMany will delete multiple records", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
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
	const values = await keyv.getMany([key1, key2, key3]);
	t.expect(values).toStrictEqual([val1, val2, val3]);
	await keyv.deleteMany([key1, key2, key3]);
	const values1 = await keyv.getMany([key1, key2, key3]);
	t.expect(values1).toStrictEqual([undefined, undefined, undefined]);
});

test.it("Async Iterator single element test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await keyv.set(testKey, testVal);
	const iterator = keyv.iterator();
	for await (const [key, raw] of iterator) {
		t.expect(key).toBe(testKey);
		t.expect(raw).toBe(testVal);
	}
});

test.it("Async Iterator multiple element test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 3,
	});
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
	for await (const [key, raw] of iterator) {
		actual.set(key, raw);
	}

	t.expect(actual).toStrictEqual(expected);
});

test.it("Async Iterator multiple elements with limit=1 test", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
		iterationLimit: 1,
	});
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
		const [k, v] = entry.value as [string, string];
		actual.set(k, v);
		entry = await iterator.next();
	}

	t.expect(actual).toStrictEqual(expected);
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
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	t.expect(await keyv.get(testKey)).toBe(undefined);
	await keyv.set(testKey, testVal);
	t.expect(await keyv.get(testKey)).toBe(testVal);
	await keyv.disconnect();
	await t.expect(async () => keyv.get(testKey)).rejects.toThrow();
});

test.it("handling namespaces with multiple keyv instances", async (t) => {
	const storeA = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
	const storeB = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
	const keyvA = new Keyv({ store: storeA, namespace: "ns1" });
	const keyvB = new Keyv({ store: storeB, namespace: "ns2" });

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

	const resultA = await keyvA.get([keyA1, keyA2, keyA3]);
	const resultB = await keyvB.get([keyA1, keyA2, keyA3]);

	t.expect(resultA).toStrictEqual([valA1, valA2, valA3]);
	t.expect(resultB).toStrictEqual([valB1, valB2, valB3]);

	const iteratorResultA = new Map<string, string>();

	const iterator1 = keyvA.iterator ? keyvA.iterator("ns1") : undefined;
	if (iterator1) {
		for await (const [key, value] of iterator1) {
			iteratorResultA.set(key, value);
		}
	}

	t.expect(iteratorResultA).toStrictEqual(
		new Map([
			[keyA1, valA1],
			[keyA2, valA2],
			[keyA3, valA3],
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
	const result = (await keyv.query("PRAGMA journal_mode")) as Array<{
		journal_mode: string;
	}>;
	t.expect(result[0].journal_mode).toBe("wal");
	await keyv.disconnect();
});

test.it("WAL mode is not enabled by default", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb-nowal.sqlite",
	});
	const result = (await keyv.query("PRAGMA journal_mode")) as Array<{
		journal_mode: string;
	}>;
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
		const result = (await keyv.query("PRAGMA journal_mode")) as Array<{
			journal_mode: string;
		}>;
		// In-memory databases cannot use WAL mode, they remain in "memory" journal mode
		t.expect(result[0].journal_mode).toBe("memory");
		// But basic operations should still work
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		const value = await keyv.get(testKey);
		t.expect(value).toBe(testVal);
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
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();
	await keyv.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
		{ key: key3, value: val3 },
	]);
	const values = await keyv.getMany([key1, key2, key3]);
	t.expect(values).toStrictEqual([val1, val2, val3]);
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
	t.expect(await keyv.get(key1)).toBe(newVal);
	t.expect(await keyv.get(key2)).toBe(val2);
});

test.it("hasMany checks multiple keys", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	await keyv.set(key1, faker.lorem.word());
	await keyv.set(key3, faker.lorem.word());
	const results = await keyv.hasMany([key1, key2, key3]);
	t.expect(results).toStrictEqual([true, false, true]);
});

test.it("hasMany with no existing keys returns all false", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	const results = await keyv.hasMany([
		faker.string.uuid(),
		faker.string.uuid(),
		faker.string.uuid(),
	]);
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
	const expiredKey = faker.string.uuid();
	const validKey = faker.string.uuid();
	await keyv.set(expiredKey, expiredValue);
	await keyv.set(validKey, validValue);
	t.expect(await keyv.has(expiredKey)).toBe(true);
	t.expect(await keyv.has(validKey)).toBe(true);
	await keyv.clearExpired();
	t.expect(await keyv.has(expiredKey)).toBe(false);
	t.expect(await keyv.has(validKey)).toBe(true);
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
	const autoExpiredKey = faker.string.uuid();
	await keyv.set(autoExpiredKey, expiredValue);
	t.expect(await keyv.has(autoExpiredKey)).toBe(true);
	// Wait for the cleanup timer to fire
	await new Promise((resolve) => {
		setTimeout(resolve, 250);
	});
	t.expect(await keyv.has(autoExpiredKey)).toBe(false);
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
	const nsKey = faker.string.uuid();
	const valA = faker.lorem.word();
	const valB = faker.lorem.word();
	await storeA.set(`nsA:${nsKey}`, valA);
	await storeB.set(`nsB:${nsKey}`, valB);

	t.expect(await storeA.get(`nsA:${nsKey}`)).toBe(valA);
	t.expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

	// Clear one namespace should not affect the other
	await storeA.clear();
	t.expect(await storeA.get(`nsA:${nsKey}`)).toBe(undefined);
	t.expect(await storeB.get(`nsB:${nsKey}`)).toBe(valB);

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
	const result = await keyv.deleteMany([
		faker.string.uuid(),
		faker.string.uuid(),
	]);
	t.expect(result).toEqual([false, false]);
});

test.it("has returns false for non-existent key", async (t) => {
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		busyTimeout: 3000,
	});
	await keyv.clear();
	t.expect(await keyv.has(faker.string.uuid())).toBe(false);
});

test.it("migrates old schema that lacks namespace column", async (t) => {
	const dbPath = "test/testdb-migration.sqlite";
	const fs = await import("node:fs");
	// Remove any leftover db
	try {
		fs.unlinkSync(dbPath);
	} catch {}

	// Create a database with the old schema (no namespace/expires columns)
	const Database = (await import("better-sqlite3")).default;
	const db = new Database(dbPath);
	db.exec("CREATE TABLE keyv(key VARCHAR(255) PRIMARY KEY, value TEXT)");
	db.prepare("INSERT INTO keyv (key, value) VALUES (?, ?)").run(
		"oldkey",
		"oldval",
	);
	db.close();

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
		const Database = (await import("better-sqlite3")).default;
		const db = new Database(dbPath);
		db.exec(
			"CREATE TABLE keyv(key VARCHAR(255) NOT NULL, value TEXT, namespace VARCHAR(255) NOT NULL DEFAULT '', UNIQUE(key, namespace))",
		);
		db.prepare("INSERT INTO keyv (key, value, namespace) VALUES (?, ?, ?)").run(
			"k1",
			"v1",
			"",
		);
		db.close();

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
	const objValue = { value: faker.lorem.word(), expires: Date.now() + 60000 };
	const objKey = faker.string.uuid();
	await keyv.set(objKey, objValue);
	t.expect(await keyv.has(objKey)).toBe(true);
});

// --- SQL injection prevention tests ---

test.it(
	"table name with SQL injection characters is sanitized at construction",
	async (t) => {
		// Attempt to inject via table name — toTableString strips all non-alphanumeric chars
		const keyv = new KeyvSqlite({
			uri: "sqlite://test/testdb.sqlite",
			table: "keyv'; DROP TABLE keyv; --",
			busyTimeout: 3000,
		});
		// Sanitized to "keyvDROPTABLEkeyv" (only alphanumeric chars kept)
		t.expect(keyv.opts.table).toBe("keyvDROPTABLEkeyv");
		// Operations should work on the sanitized table name
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		t.expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.clear();
		await keyv.disconnect();
	},
);

test.it(
	"opts setter sanitizes table name (prevents post-construction injection)",
	(t) => {
		const keyv = new KeyvSqlite({ uri: "sqlite://test/testdb.sqlite" });
		keyv.opts = { table: "evil'; DROP TABLE keyv;--" };
		// Should be sanitized, not the raw malicious string
		t.expect(keyv.opts.table).toBe("evilDROPTABLEkeyv");
	},
);

test.it(
	"table name that is a SQLite reserved keyword works correctly",
	async (t) => {
		const keyv = new KeyvSqlite({
			uri: "sqlite://test/testdb.sqlite",
			table: "select",
			busyTimeout: 3000,
		});
		// escapeIdentifier wraps in double quotes, so "select" is safe as a table name
		t.expect(keyv.opts.table).toBe("select");
		const testKey = faker.string.uuid();
		const testVal = faker.lorem.word();
		await keyv.set(testKey, testVal);
		t.expect(await keyv.get(testKey)).toBe(testVal);
		await keyv.clear();
		await keyv.disconnect();
	},
);

test.it("table name with double quotes is escaped correctly", async (t) => {
	// Double quotes in the name would break identifier escaping without proper handling
	// toTableString strips them, but escapeIdentifier also handles them as defense-in-depth
	const keyv = new KeyvSqlite({
		uri: "sqlite://test/testdb.sqlite",
		table: 'my"table',
		busyTimeout: 3000,
	});
	// toTableString strips the double-quote character
	t.expect(keyv.opts.table).toBe("mytable");
	const testKey = faker.string.uuid();
	const testVal = faker.lorem.word();
	await keyv.set(testKey, testVal);
	t.expect(await keyv.get(testKey)).toBe(testVal);
	await keyv.clear();
	await keyv.disconnect();
});

test.it("property getters return correct defaults", async (t) => {
	const keyv = new KeyvSqlite();
	t.expect(keyv.uri).toBe("sqlite://:memory:");
	t.expect(keyv.dialect).toBe("sqlite");
	t.expect(keyv.table).toBe("keyv");
	t.expect(keyv.keySize).toBe(255);
	t.expect(keyv.namespaceLength).toBe(255);
	t.expect(keyv.db).toBe(":memory:");
	t.expect(keyv.iterationLimit).toBe(10);
	t.expect(keyv.wal).toBe(false);
	t.expect(keyv.busyTimeout).toBeUndefined();
	t.expect(keyv.driver).toBeUndefined();
	t.expect(keyv.namespace).toBeUndefined();
	t.expect(keyv.clearExpiredInterval).toBe(0);
	await keyv.disconnect();
});

test.it("property getters return constructor-provided values", async (t) => {
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
	t.expect(keyv.table).toBe("custom");
	t.expect(keyv.keySize).toBe(512);
	t.expect(keyv.namespaceLength).toBe(128);
	t.expect(keyv.busyTimeout).toBe(5000);
	t.expect(keyv.iterationLimit).toBe(50);
	t.expect(keyv.driver).toBe("better-sqlite3");
	await keyv.disconnect();
});

test.it("table setter sanitizes input", async (t) => {
	const keyv = new KeyvSqlite("sqlite://:memory:");
	keyv.table = "my_table";
	t.expect(keyv.table).toBe("my_table");
	keyv.table = '3bad"name';
	t.expect(keyv.table).toBe("_3badname");
	await keyv.disconnect();
});

test.it("keySize setter updates value", async (t) => {
	const keyv = new KeyvSqlite("sqlite://:memory:");
	t.expect(keyv.keySize).toBe(255);
	keyv.keySize = 512;
	t.expect(keyv.keySize).toBe(512);
	await keyv.disconnect();
});

test.it("namespaceLength setter updates value", async (t) => {
	const keyv = new KeyvSqlite("sqlite://:memory:");
	t.expect(keyv.namespaceLength).toBe(255);
	keyv.namespaceLength = 128;
	t.expect(keyv.namespaceLength).toBe(128);
	await keyv.disconnect();
});

test.it("setMany returns false entries on query error", async (t) => {
	const keyv = new KeyvSqlite("sqlite://:memory:");
	let emittedError = false;
	keyv.on("error", () => {
		emittedError = true;
	});
	// Close the connection to force an error
	await keyv.disconnect();
	const result = await keyv.setMany([
		{ key: "key1", value: "val1" },
		{ key: "key2", value: "val2" },
	]);
	t.expect(result).toEqual([false, false]);
	t.expect(emittedError).toBe(true);
});

test.it("iterationLimit setter updates value", async (t) => {
	const keyv = new KeyvSqlite("sqlite://:memory:");
	t.expect(keyv.iterationLimit).toBe(10);
	keyv.iterationLimit = 99;
	t.expect(keyv.iterationLimit).toBe(99);
	await keyv.disconnect();
});
