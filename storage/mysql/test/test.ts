import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { faker } from "@faker-js/faker";
import { delay, keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import mysql from "mysql2";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import KeyvMysqlAdapter, { createKeyv, type KeyvMysqlOptions } from "../src/index.js";
import { parseConnectionString } from "../src/pool.js";

const uri = "mysql://root@localhost:3306/keyv_test";
const execFileAsync = promisify(execFile);
const mysqlAdapters = new Set<KeyvMysqlAdapter>();

class KeyvMysql extends KeyvMysqlAdapter {
	constructor(options?: KeyvMysqlOptions | string) {
		super(options);
		mysqlAdapters.add(this);
	}
}

const store = () => new KeyvMysql({ uri, iterationLimit: 2 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
storageTestSuite(test, store);

beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

afterEach(async () => {
	const adapters = [...mysqlAdapters];
	mysqlAdapters.clear();
	await Promise.all(adapters.map(async (adapter) => adapter.disconnect()));
});

describe("constructor", () => {
	test("uses the default uri when no options are provided", () => {
		const keyv = new KeyvMysql();
		expect(keyv.uri).toBe("mysql://localhost");
	});

	test("accepts mysql connection options without a uri", async () => {
		const keyv = new KeyvMysql({
			host: "localhost",
			port: 3306,
			user: "root",
			database: "keyv_test",
		});
		expect(keyv.uri).toBe("mysql://localhost");
		expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
	});

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

	test("rejects key column lengths that exceed MySQL's composite index limit", () => {
		expect(() => new KeyvMysql({ uri, keyLength: 512, namespaceLength: 512 })).toThrow(
			"3072-byte composite index limit",
		);
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
		keyv.keyLength = 512;
		expect(keyv.keyLength).toBe(512);
		keyv.namespaceLength = 128;
		expect(keyv.namespaceLength).toBe(128);
		expect(() => {
			keyv.namespaceLength = 257;
		}).toThrow("3072-byte composite index limit");
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
		const pastExpires = Date.now() - 1000;
		const expiredValue = JSON.stringify({ value: "old", expires: pastExpires });
		await keyv.set(key, expiredValue, pastExpires);
		expect(await keyv.has(key)).toBe(false);
		// The expired key should have been deleted.
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("hasMany returns false for expired keys and deletes them", async () => {
		const keyv = new KeyvMysql(uri);
		const expiredKey1 = faker.string.alphanumeric(10);
		const expiredKey2 = faker.string.alphanumeric(10);
		const validKey = faker.string.alphanumeric(10);
		const pastExpires = Date.now() - 1000;
		const futureExpires = Date.now() + 60_000;
		const expiredValue = JSON.stringify({ value: "old", expires: pastExpires });
		const validValue = JSON.stringify({ value: "fresh", expires: futureExpires });
		await keyv.set(expiredKey1, expiredValue, pastExpires);
		await keyv.set(expiredKey2, expiredValue, pastExpires);
		await keyv.set(validKey, validValue, futureExpires);
		const result = await keyv.hasMany([expiredKey1, expiredKey2, validKey]);
		expect(result).toStrictEqual([false, false, true]);
		// The expired keys should have been deleted.
		expect(await keyv.get(expiredKey1)).toBeUndefined();
		expect(await keyv.get(expiredKey2)).toBeUndefined();
	});
});

describe("expired read cleanup", () => {
	const cases: Array<{
		name: string;
		read: (keyv: KeyvMysql, key: string) => Promise<unknown>;
		expected: unknown;
	}> = [
		{
			name: "get",
			read: async (keyv, key) => keyv.get(key),
			expected: undefined,
		},
		{
			name: "getMany",
			read: async (keyv, key) => keyv.getMany([key]),
			expected: [undefined],
		},
		{
			name: "has",
			read: async (keyv, key) => keyv.has(key),
			expected: false,
		},
		{
			name: "hasMany",
			read: async (keyv, key) => keyv.hasMany([key]),
			expected: [false],
		},
	];

	for (const testCase of cases) {
		test(`${testCase.name} does not delete a concurrent fresh write`, async () => {
			const namespace = faker.string.uuid();
			const key = faker.string.alphanumeric(10);
			const reader = new KeyvMysql(uri);
			const writer = new KeyvMysql(uri);
			reader.namespace = namespace;
			writer.namespace = namespace;
			await writer.set(key, "expired", Date.now() - 1000);

			const originalQuery = reader.query;
			let refreshed = false;
			reader.query = (async <T>(sqlString: string) => {
				if (!refreshed && sqlString.startsWith("DELETE FROM")) {
					refreshed = true;
					expect(await writer.set(key, "fresh", Date.now() + 60_000)).toBe(true);
				}

				return originalQuery<T>(sqlString);
			}) as typeof reader.query;

			expect(await testCase.read(reader, key)).toEqual(testCase.expected);
			expect(refreshed).toBe(true);
			expect(await writer.get(key)).toBe("fresh");
			await writer.delete(key);
		});
	}
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

describe("delete", () => {
	test("uses one DELETE query and returns whether a row was affected", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "value");
		const query = vi.spyOn(keyv, "query");

		expect(await keyv.delete(key)).toBe(true);
		expect(query).toHaveBeenCalledOnce();
		expect(query.mock.calls[0][0]).toMatch(/^DELETE FROM/);

		query.mockClear();
		expect(await keyv.delete(key)).toBe(false);
		expect(query).toHaveBeenCalledOnce();
		expect(query.mock.calls[0][0]).toMatch(/^DELETE FROM/);
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
		await keyv.set(expiredKey, expired, 1);
		await keyv.set(validKey, valid, 9999999999999);
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
		await keyv.set(key, valid, 9999999999999);
		await keyv.clearExpired();
		expect(await keyv.get(key)).toBe(valid);
	});
});

describe("expires column", () => {
	test("set stores the expires passed as the third argument", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const valueWithExpires = JSON.stringify({ value: "bar", expires: 9999999999999 });
		await keyv.set(key, valueWithExpires, 9999999999999);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(Number(rows[0].expires)).toBe(9999999999999);
	});

	test("set stores null expires when no expires is passed", async () => {
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
		await keyv.set(key, JSON.stringify({ value: "bar", expires: 1000 }), 1000);
		const rows1 = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(Number(rows1[0].expires)).toBe(1000);
		await keyv.set(key, JSON.stringify({ value: "bar", expires: 2000 }), 2000);
		const rows2 = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(Number(rows2[0].expires)).toBe(2000);
	});

	test("setMany stores expires for each entry", async () => {
		const keyv = new KeyvMysql(uri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await keyv.setMany([
			{ key: key1, value: JSON.stringify({ value: "a", expires: 5000 }), expires: 5000 },
			{ key: key2, value: JSON.stringify({ value: "b" }) },
		]);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT CONVERT(id USING utf8mb4) AS id, expires FROM \`keyv\` WHERE id IN ('${key1}', '${key2}') AND namespace = ''`,
		);
		const row1 = rows.find((r) => r.id === key1);
		const row2 = rows.find((r) => r.id === key2);
		expect(Number(row1?.expires)).toBe(5000);
		expect(row2?.expires).toBeNull();
	});

	test("set stores null expires when the value is a number and no expires is passed", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, 42);
		const rows = await keyv.query<mysql.RowDataPacket[]>(
			`SELECT expires FROM \`keyv\` WHERE id = '${key}' AND namespace = ''`,
		);
		expect(rows[0].expires).toBeNull();
	});

	test("set stores null expires when the value is null and no expires is passed", async () => {
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

	// Regression: before v6 the adapter recovered `expires` by JSON.parsing the stored
	// value, which silently failed for compressed/encrypted/msgpackr/superjson output and
	// left the expires column NULL. The contract now passes expires directly.
	test("populates the expires column for non-JSON encoded values so expiry still works", async () => {
		const store = new KeyvMysql({ uri, iterationLimit: 2 });
		const serialization = {
			stringify: (data: unknown) => `RAW:${JSON.stringify(data)}`,
			parse: <T>(data: string): T => JSON.parse(String(data).slice(4)) as T,
		};
		const keyv = new Keyv({ store, serialization });
		const key = faker.string.uuid();
		await keyv.set(key, "value", 100);
		expect(await keyv.get(key)).toBe("value");
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});
		expect(await keyv.get(key)).toBeUndefined();
		await store.clearExpired();
		expect(await store.has(key)).toBe(false);
		await keyv.disconnect();
	});
});

describe("intervalExpiration", () => {
	test("deletes expired keys on the configured schedule", async () => {
		const admin = new KeyvMysql(uri);
		const table = `keyv_timer_${faker.string.alphanumeric(12)}`;
		const tableEsc = `\`${table}\``;
		const keyvMysql = new KeyvMysql({ uri, table, intervalExpiration: 0.05 });
		const expiredKey = faker.string.alphanumeric(10);
		const persistentKey = faker.string.alphanumeric(10);

		try {
			await keyvMysql.set(expiredKey, "expired", Date.now() - 1000);
			await keyvMysql.set(persistentKey, "persistent");

			await delay(250);

			const rows = await keyvMysql.query<mysql.RowDataPacket[]>(
				mysql.format(
					`SELECT CONVERT(id USING utf8mb4) AS id FROM ${tableEsc} WHERE id IN (?, ?) AND namespace = ''`,
					[expiredKey, persistentKey],
				),
			);
			expect(rows.map((row) => row.id)).toEqual([persistentKey]);
		} finally {
			await keyvMysql.disconnect();
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
		}
	});

	test("unrefs, restarts, disables, and disconnects the application timer", async () => {
		const keyv = new KeyvMysql({ uri, intervalExpiration: 60 });
		const getTimer = () =>
			(
				keyv as unknown as {
					_clearExpiredTimer?: ReturnType<typeof setInterval>;
				}
			)._clearExpiredTimer;

		const firstTimer = getTimer();
		expect(firstTimer).toBeDefined();
		expect(firstTimer?.hasRef()).toBe(false);

		keyv.intervalExpiration = 30;
		const secondTimer = getTimer();
		expect(secondTimer).toBeDefined();
		expect(secondTimer).not.toBe(firstTimer);
		expect(secondTimer?.hasRef()).toBe(false);

		keyv.intervalExpiration = undefined;
		expect(getTimer()).toBeUndefined();

		keyv.intervalExpiration = 30;
		expect(getTimer()).toBeDefined();
		await keyv.disconnect();
		expect(getTimer()).toBeUndefined();

		keyv.intervalExpiration = 30;
		expect(getTimer()).toBeUndefined();
	});

	test("rejects cleanup intervals that exceed the Node.js timer limit", () => {
		expect(
			() =>
				new KeyvMysql({
					uri,
					intervalExpiration: 2_147_483.648,
				}),
		).toThrow("intervalExpiration must not exceed 2147483.647 seconds");

		const keyv = new KeyvMysql({ uri, intervalExpiration: 60 });
		expect(() => {
			keyv.intervalExpiration = Number.POSITIVE_INFINITY;
		}).toThrow("intervalExpiration must not exceed 2147483.647 seconds");
		expect(keyv.intervalExpiration).toBe(60);
	});

	test("does not overlap automatic cleanup runs", async () => {
		const keyv = new KeyvMysql({ uri });
		let releaseCleanup = () => {};
		const blockedCleanup = new Promise<void>((resolve) => {
			releaseCleanup = resolve;
		});
		const clearExpired = vi
			.spyOn(keyv, "clearExpired")
			.mockImplementation(async () => blockedCleanup);

		try {
			keyv.intervalExpiration = 0.01;
			await vi.waitFor(() => {
				expect(clearExpired).toHaveBeenCalledTimes(1);
			});
			await delay(50);
			expect(clearExpired).toHaveBeenCalledTimes(1);
		} finally {
			keyv.intervalExpiration = undefined;
			releaseCleanup();
			await keyv.disconnect();
		}
	});
});

describe("v6 migration", () => {
	test("dry-run previews a legacy table without modifying its schema", async () => {
		const admin = new KeyvMysql(uri);
		const table = `keyv_dry_run_${faker.string.alphanumeric(12)}`;
		const tableEsc = `\`${table}\``;

		try {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await admin.query(
				`CREATE TABLE ${tableEsc} (id VARCHAR(255) NOT NULL PRIMARY KEY, value TEXT)`,
			);
			await admin.query(
				mysql.format(`INSERT INTO ${tableEsc} (id, value) VALUES (?, ?)`, [
					"legacy:key",
					"legacy-value",
				]),
			);

			const schemaBefore = await admin.query<mysql.RowDataPacket[]>(
				`SHOW CREATE TABLE ${tableEsc}`,
			);
			const { stdout } = await execFileAsync(
				process.execPath,
				["scripts/migrate-v6.ts", "--uri", uri, "--table", table, "--dry-run"],
				{ cwd: new URL("../", import.meta.url), encoding: "utf8" },
			);
			const schemaAfter = await admin.query<mysql.RowDataPacket[]>(`SHOW CREATE TABLE ${tableEsc}`);

			expect(stdout).toContain('"legacy:key" -> id="key", namespace="legacy"');
			expect(stdout).toContain("Dry run — no changes made.");
			expect(schemaAfter[0]["Create Table"]).toBe(schemaBefore[0]["Create Table"]);
			const rows = await admin.query<mysql.RowDataPacket[]>(`SELECT id, value FROM ${tableEsc}`);
			expect(rows).toMatchObject([{ id: "legacy:key", value: "legacy-value" }]);
		} finally {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
		}
	});

	test("rejects configured key widths above MySQL's index limit", async () => {
		await expect(
			execFileAsync(
				process.execPath,
				[
					"scripts/migrate-v6.ts",
					"--uri",
					uri,
					"--keyLength",
					"512",
					"--namespaceLength",
					"512",
					"--dry-run",
				],
				{ cwd: new URL("../", import.meta.url), encoding: "utf8" },
			),
		).rejects.toMatchObject({ stderr: expect.stringContaining("3072-byte composite index limit") });
	});

	test("preserves widths while migrating one column and replacing the legacy index", async () => {
		const admin = new KeyvMysql(uri);
		const table = `keyv_index_migration_${faker.string.alphanumeric(12)}`;
		const tableEsc = `\`${table}\``;
		const indexName = `${table}_key_namespace_idx`;
		const indexEsc = `\`${indexName}\``;

		try {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await admin.query(
				`CREATE TABLE ${tableEsc} (id VARCHAR(512) NOT NULL, value TEXT, namespace VARBINARY(1020) NOT NULL DEFAULT '', UNIQUE INDEX ${indexEsc} (id, namespace))`,
			);
			await admin.query(
				mysql.format(`INSERT INTO ${tableEsc} (id, value, namespace) VALUES (?, ?, '')`, [
					"legacy:key",
					"legacy-value",
				]),
			);

			await execFileAsync(
				process.execPath,
				["scripts/migrate-v6.ts", "--uri", uri, "--table", table],
				{ cwd: new URL("../", import.meta.url), encoding: "utf8" },
			);

			const columns = await admin.query<mysql.RowDataPacket[]>(
				`SHOW COLUMNS FROM ${tableEsc} WHERE Field IN ('id', 'namespace')`,
			);
			expect(
				Object.fromEntries(
					columns.map((column) => [column.Field, String(column.Type).toLowerCase()]),
				),
			).toEqual({ id: "varbinary(2048)", namespace: "varbinary(1020)" });

			const indexes = await admin.query<mysql.RowDataPacket[]>(
				mysql.format(`SHOW INDEX FROM ${tableEsc} WHERE Key_name = ?`, [indexName]),
			);
			const indexColumns = [...indexes]
				.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
				.map((row) => row.Column_name);
			expect(indexColumns).toEqual(["namespace", "id"]);
			expect(indexes.every((row) => Number(row.Non_unique) === 0)).toBe(true);
		} finally {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
		}
	});

	test("atomically reorders a legacy index during concurrent initialization", async () => {
		const admin = new KeyvMysql(uri);
		const table = `keyv_concurrent_index_${faker.string.alphanumeric(12)}`;
		const tableEsc = `\`${table}\``;
		const indexName = `${table}_key_namespace_idx`;
		const indexEsc = `\`${indexName}\``;

		try {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await admin.query(
				`CREATE TABLE ${tableEsc}(id VARBINARY(1020) NOT NULL, value TEXT, namespace VARBINARY(1020) NOT NULL DEFAULT '', UNIQUE INDEX ${indexEsc} (id, namespace))`,
			);

			const adapters = Array.from({ length: 3 }, () => new KeyvMysql({ uri, table }));
			await Promise.all(
				adapters.map(async (adapter) => adapter.query<mysql.RowDataPacket[]>("SELECT 1")),
			);

			const indexes = await admin.query<mysql.RowDataPacket[]>(
				mysql.format(`SHOW INDEX FROM ${tableEsc} WHERE Key_name = ?`, [indexName]),
			);
			const indexColumns = [...indexes]
				.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
				.map((row) => row.Column_name);
			expect(indexColumns).toEqual(["namespace", "id"]);
			expect(indexes.every((row) => Number(row.Non_unique) === 0)).toBe(true);
		} finally {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
		}
	});
});

describe("configured character limits", () => {
	test("rejects ASCII keys longer than keyLength before querying MySQL", async () => {
		const keyv = new KeyvMysql({ uri, keyLength: 4 });
		const onError = vi.fn();
		keyv.on("error", onError);

		expect(await keyv.set("abcd", "at-limit")).toBe(true);
		const query = vi.spyOn(keyv, "query");
		expect(await keyv.set("abcde", "over-limit")).toBe(false);
		expect(query).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(expect.any(RangeError));
		expect(onError.mock.calls[0][0].message).toContain("keyLength of 4");

		await expect(keyv.get("abcde")).rejects.toThrow(RangeError);
		expect(query).not.toHaveBeenCalled();
		query.mockRestore();
		expect(await keyv.delete("abcd")).toBe(true);
	});

	test("counts Unicode code points rather than UTF-16 units", async () => {
		const keyv = new KeyvMysql({ uri, keyLength: 2 });
		keyv.on("error", () => {});
		const atLimit = "😀é";
		const overLimit = `${atLimit}a`;

		expect(atLimit.length).toBe(3);
		expect(Array.from(atLimit)).toHaveLength(2);
		expect(await keyv.set(atLimit, "at-limit")).toBe(true);
		expect(await keyv.get(atLimit)).toBe("at-limit");
		expect(await keyv.set(overLimit, "over-limit")).toBe(false);
		await expect(keyv.has(overLimit)).rejects.toThrow("keyLength of 2");
		expect(await keyv.delete(atLimit)).toBe(true);
	});

	test("enforces namespaceLength before encoding", async () => {
		const keyv = new KeyvMysql({ uri, namespaceLength: 2 });
		const onError = vi.fn();
		keyv.on("error", onError);
		keyv.namespace = "😀é";

		expect(await keyv.set("key", "at-limit")).toBe(true);
		expect(await keyv.get("key")).toBe("at-limit");
		await keyv.clear();

		keyv.namespace = "😀éa";
		const query = vi.spyOn(keyv, "query");
		expect(await keyv.set("key", "over-limit")).toBe(false);
		expect(query).not.toHaveBeenCalled();
		expect(onError.mock.calls[0][0]).toBeInstanceOf(RangeError);
		expect(onError.mock.calls[0][0].message).toContain("namespaceLength of 2");
		await expect(keyv.clear()).rejects.toThrow("namespaceLength of 2");
		expect(query).not.toHaveBeenCalled();
	});
});

describe("byte-exact keys and namespaces", () => {
	test("distinguishes case, accents, Unicode normalization, and trailing spaces", async () => {
		const keyv = new KeyvMysql(uri);
		keyv.namespace = faker.string.uuid();
		const entries = [
			{ key: "AuditKey", value: "uppercase" },
			{ key: "auditkey", value: "lowercase" },
			{ key: "accent-cafe", value: "plain" },
			{ key: "accent-café", value: "accented" },
			{ key: "normalized-é", value: "composed" },
			{ key: "normalized-e\u0301", value: "decomposed" },
			{ key: "trailing-space", value: "without-space" },
			{ key: "trailing-space ", value: "with-space" },
		];

		expect(await keyv.setMany(entries)).toEqual(entries.map(() => true));
		expect(await keyv.getMany(entries.map(({ key }) => key))).toEqual(
			entries.map(({ value }) => value),
		);
		expect(await keyv.hasMany(entries.map(({ key }) => key))).toEqual(entries.map(() => true));

		const iterated = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			iterated.set(key, value);
		}

		for (const { key, value } of entries) {
			expect(iterated.get(key)).toBe(value);
		}

		await keyv.clear();
	});

	test("applies byte-exact comparisons to namespaces", async () => {
		const keyv = new KeyvMysql(uri);
		const suffix = faker.string.alphanumeric(10);
		const key = faker.string.alphanumeric(10);
		const namespaces = [
			`AuditNS-${suffix}`,
			`auditns-${suffix}`,
			`cafe-${suffix}`,
			`café-${suffix}`,
			`normalized-é-${suffix}`,
			`normalized-e\u0301-${suffix}`,
			`trailing-${suffix}`,
			`trailing-${suffix} `,
		];

		for (const [index, namespace] of namespaces.entries()) {
			keyv.namespace = namespace;
			expect(await keyv.set(key, `value-${index}`)).toBe(true);
		}

		for (const [index, namespace] of namespaces.entries()) {
			keyv.namespace = namespace;
			expect(await keyv.get(key)).toBe(`value-${index}`);
			await keyv.clear();
		}
	});

	test("migrates only text columns and preserves their existing widths", async () => {
		const admin = new KeyvMysql(uri);
		const table = `keyv_binary_${faker.string.alphanumeric(12)}`;
		const tableEsc = `\`${table}\``;
		const indexName = `${table}_key_namespace_idx`;
		const indexEsc = `\`${indexName}\``;
		const legacyKey = "Legacy-é ";
		const legacyNamespace = "n".repeat(300);

		try {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await admin.query(
				`CREATE TABLE ${tableEsc}(id VARBINARY(1020) NOT NULL, value TEXT, namespace VARCHAR(512) NOT NULL DEFAULT '', UNIQUE INDEX ${indexEsc} (id, namespace))`,
			);
			await admin.query(
				mysql.format(`INSERT INTO ${tableEsc} (id, value, namespace) VALUES (?, ?, ?)`, [
					legacyKey,
					"legacy-value",
					legacyNamespace,
				]),
			);

			const migrated = new KeyvMysql({ uri, table });
			const columns = await migrated.query<mysql.RowDataPacket[]>(
				`SHOW COLUMNS FROM ${tableEsc} WHERE Field IN ('id', 'namespace')`,
			);
			expect(
				Object.fromEntries(
					columns.map((column) => [column.Field, String(column.Type).toLowerCase()]),
				),
			).toEqual({ id: "varbinary(1020)", namespace: "varbinary(2048)" });
			const rows = await migrated.query<mysql.RowDataPacket[]>(
				`SELECT CONVERT(id USING utf8mb4) AS id, CONVERT(namespace USING utf8mb4) AS namespace, value FROM ${tableEsc}`,
			);
			expect(rows).toMatchObject([
				{ id: legacyKey, namespace: legacyNamespace, value: "legacy-value" },
			]);

			const indexes = await migrated.query<mysql.RowDataPacket[]>(
				mysql.format(`SHOW INDEX FROM ${tableEsc} WHERE Key_name = ?`, [indexName]),
			);
			const indexColumns = [...indexes]
				.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
				.map((row) => row.Column_name);
			expect(indexColumns).toEqual(["namespace", "id"]);
			expect(indexes.every((row) => Number(row.Non_unique) === 0)).toBe(true);
		} finally {
			await admin.query(`DROP TABLE IF EXISTS ${tableEsc}`);
		}
	});
});

describe("namespace", () => {
	test("does not collapse keys that begin with the namespace", async () => {
		const namespace = "ns";
		const mysql = new KeyvMysql(uri);
		const keyv = new Keyv({ store: mysql, namespace });

		await keyv.set("foo", "plain");
		await keyv.set(`${namespace}:foo`, "prefixed");

		expect(await keyv.get("foo")).toBe("plain");
		expect(await keyv.get(`${namespace}:foo`)).toBe("prefixed");
	});

	test("preserves namespace-like prefixes in bulk operations and iteration", async () => {
		const namespace = "ns";
		const keyv = new KeyvMysql(uri);
		keyv.namespace = namespace;
		const keys = ["foo", `${namespace}:foo`];

		expect(
			await keyv.setMany([
				{ key: keys[0], value: "plain" },
				{ key: keys[1], value: "prefixed" },
			]),
		).toEqual([true, true]);
		expect(await keyv.getMany(keys)).toEqual(["plain", "prefixed"]);
		expect(await keyv.hasMany(keys)).toEqual([true, true]);

		const entries = new Map<string, string>();
		for await (const [key, value] of keyv.iterator()) {
			entries.set(key, value);
		}

		expect(entries.get(keys[0])).toBe("plain");
		expect(entries.get(keys[1])).toBe("prefixed");
		expect(await keyv.deleteMany(keys)).toEqual([true, true]);
		expect(await keyv.hasMany(keys)).toEqual([false, false]);
	});

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
	test("uses the default batch size when iterationLimit is zero", async () => {
		const keyv = new KeyvMysql({ uri, iterationLimit: 0 });
		const key = faker.string.alphanumeric(10);
		await keyv.clear();
		await keyv.set(key, "value");

		const entries = new Map<string, string>();
		for await (const [entryKey, value] of keyv.iterator()) {
			entries.set(entryKey, value);
		}

		expect(entries.get(key)).toBe("value");
	});

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
		const disconnecting = keyv.disconnect();
		expect(keyv.disconnect()).toBe(disconnecting);
		await disconnecting;
		await expect(keyv.get(key)).rejects.toBeDefined();
	});

	test("waits for queries that started before disconnect", async () => {
		const keyv = new KeyvMysql(uri);
		const key = faker.string.alphanumeric(10);
		const writing = keyv.set(key, "value");

		await keyv.disconnect();
		await expect(writing).resolves.toBe(true);

		const reader = new KeyvMysql(uri);
		expect(await reader.get(key)).toBe("value");
	});

	test("does not affect another adapter when disconnected", async () => {
		const first = new KeyvMysql({ uri, connectionLimit: 3 });
		const second = new KeyvMysql({ uri, connectionLimit: 3 });
		const key = faker.string.alphanumeric(10);
		await second.set(key, "value");

		await first.disconnect();
		await first.disconnect();

		await expect(first.get(key)).rejects.toThrow("MySQL adapter is disconnected");
		expect(await second.get(key)).toBe("value");
		await second.disconnect();

		const replacement = new KeyvMysql({ uri, connectionLimit: 3 });
		expect(await replacement.get(key)).toBe("value");
		await replacement.disconnect();
	});

	test("does not share a pool when connection options differ", async () => {
		const valid = new KeyvMysql({ uri, connectionLimit: 4 });
		const invalid = new KeyvMysql({
			uri,
			connectionLimit: 4,
			user: "keyv_invalid_user",
			password: "invalid-password",
		});

		try {
			expect(await valid.get(faker.string.alphanumeric(10))).toBeUndefined();
			await expect(invalid.get(faker.string.alphanumeric(10))).rejects.toThrow();
		} finally {
			await Promise.all([valid.disconnect(), invalid.disconnect()]);
		}
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
		await keyv.disconnect();
	});

	test("returns a Keyv instance from an options object", async () => {
		const keyv = createKeyv({ uri, table: "keyv" });
		expect(keyv).toBeInstanceOf(Keyv);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
		await keyv.disconnect();
	});
});
