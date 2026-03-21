import { faker } from "@faker-js/faker";
import sqlite3 from "sqlite3";
import { describe, expect, it, vi } from "vitest";
import { resolveDriver } from "../src/drivers/index.js";
import type { SqliteDriver } from "../src/drivers/types.js";
import KeyvSqlite, { createSqlite3Driver } from "../src/index.js";

describe("driver selection", () => {
	it("driverName is available after ready", async () => {
		const store = new KeyvSqlite("sqlite://:memory:");
		await store.ready;
		expect(store.driverName).toEqual(expect.any(String));
		await store.disconnect();
	});

	it("ready promise resolves without error", async () => {
		const store = new KeyvSqlite("sqlite://:memory:");
		await expect(store.ready).resolves.toBeUndefined();
		await store.disconnect();
	});

	it("auto-detects better-sqlite3 by default", async () => {
		const store = new KeyvSqlite("sqlite://:memory:");
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		expect(await store.get(key)).toBe(val);
		await store.disconnect();
	});

	it("accepts explicit driver: 'better-sqlite3'", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		expect(await store.get(key)).toBe(val);
		await store.disconnect();
	});

	it("throws for invalid driver name", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			// @ts-expect-error testing invalid driver
			driver: "nonexistent-driver",
		});
		await expect(store.get("key1")).rejects.toThrow(
			/Failed to load SQLite driver/,
		);
	});

	it("bun:sqlite driver fails to load outside Bun runtime", async () => {
		await expect(resolveDriver("bun:sqlite")).rejects.toThrow(
			/Failed to load SQLite driver "bun:sqlite"/,
		);
	});

	it("accepts a custom SqliteDriver object", async () => {
		const Database = (await import("better-sqlite3")).default;
		const customDriver: SqliteDriver = {
			name: "better-sqlite3",
			async connect(options) {
				const db = new Database(options.filename);
				return {
					async query(sql, ...params) {
						const safeParams = params.map((p) =>
							p !== null && typeof p === "object" ? JSON.stringify(p) : p,
						);
						const trimmed = sql.trimStart().toUpperCase();
						if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA")) {
							return db.prepare(sql).all(...safeParams);
						}

						db.prepare(sql).run(...safeParams);
						return [];
					},
					async close() {
						db.close();
					},
				};
			},
		};

		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: customDriver,
		});
		const customKey = faker.string.uuid();
		const customVal = faker.lorem.word();
		await store.set(customKey, customVal);
		expect(await store.get(customKey)).toBe(customVal);
		await store.disconnect();
	});
});

describe("better-sqlite3 driver operations", () => {
	it("get/set/delete/has work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		const keyA = faker.string.uuid();
		const keyB = faker.string.uuid();
		const valA = faker.lorem.word();
		const valB = faker.lorem.word();
		await store.set(keyA, valA);
		await store.set(keyB, valB);
		expect(await store.get(keyA)).toBe(valA);
		expect(await store.has(keyA)).toBe(true);
		expect(await store.has(faker.string.uuid())).toBe(false);
		expect(await store.delete(keyA)).toBe(true);
		expect(await store.get(keyA)).toBeUndefined();
		await store.disconnect();
	});

	it("getMany/setMany/deleteMany/hasMany work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		const keyX = faker.string.uuid();
		const keyY = faker.string.uuid();
		const keyZ = faker.string.uuid();
		const valX = faker.lorem.word();
		const valY = faker.lorem.word();
		const valZ = faker.lorem.word();
		const missingKey = faker.string.uuid();
		await store.setMany([
			{ key: keyX, value: valX },
			{ key: keyY, value: valY },
			{ key: keyZ, value: valZ },
		]);
		const values = await store.getMany([keyX, keyY, keyZ, missingKey]);
		expect(values).toEqual([valX, valY, valZ, undefined]);
		expect(await store.hasMany([keyX, missingKey])).toEqual([true, false]);
		expect(await store.deleteMany([keyX, keyY])).toBe(true);
		expect(await store.get(keyX)).toBeUndefined();
		await store.disconnect();
	});

	it("clear works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	it("iterator works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		await store.set(faker.string.uuid(), faker.lorem.word());
		await store.set(faker.string.uuid(), faker.lorem.word());
		const entries: Array<[string, string]> = [];
		for await (const entry of store.iterator()) {
			entries.push(entry as [string, string]);
		}

		expect(entries.length).toBe(2);
		await store.disconnect();
	});

	it("WAL mode works with file-based database", async () => {
		const fs = await import("node:fs");
		const dbPath = "test/testdb-wal-driver.sqlite";
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const store = new KeyvSqlite({
			uri: `sqlite://${dbPath}`,
			driver: "better-sqlite3",
			wal: true,
		});
		const walKey = faker.string.uuid();
		const walVal = faker.lorem.word();
		await store.set(walKey, walVal);
		expect(await store.get(walKey)).toBe(walVal);
		await store.disconnect();

		try {
			fs.unlinkSync(dbPath);
			fs.unlinkSync(`${dbPath}-wal`);
			fs.unlinkSync(`${dbPath}-shm`);
		} catch {}
	});

	it("WAL mode on in-memory database logs warning", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
			wal: true,
		});
		await store.set(faker.string.uuid(), faker.lorem.word());
		expect(warnSpy).toHaveBeenCalledWith(
			"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
		);
		warnSpy.mockRestore();
		await store.disconnect();
	});

	it("busyTimeout option is accepted", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
			busyTimeout: 5000,
		});
		const btKey = faker.string.uuid();
		const btVal = faker.lorem.word();
		await store.set(btKey, btVal);
		expect(await store.get(btKey)).toBe(btVal);
		await store.disconnect();
	});
});

describe("sqlite3 helper driver", () => {
	it("basic set/get with in-memory db", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		expect(await store.get(key)).toBe(val);
		await store.disconnect();
	});

	it("driver name is 'custom'", () => {
		const driver = createSqlite3Driver(sqlite3);
		expect(driver.name).toBe("custom");
	});

	it("get/set/delete/has work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		const keyA = faker.string.uuid();
		const keyB = faker.string.uuid();
		const valA = faker.lorem.word();
		const valB = faker.lorem.word();
		await store.set(keyA, valA);
		await store.set(keyB, valB);
		expect(await store.get(keyA)).toBe(valA);
		expect(await store.has(keyA)).toBe(true);
		expect(await store.has(faker.string.uuid())).toBe(false);
		expect(await store.delete(keyA)).toBe(true);
		expect(await store.get(keyA)).toBeUndefined();
		await store.disconnect();
	});

	it("getMany/setMany/deleteMany/hasMany work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		const keyX = faker.string.uuid();
		const keyY = faker.string.uuid();
		const keyZ = faker.string.uuid();
		const valX = faker.lorem.word();
		const valY = faker.lorem.word();
		const valZ = faker.lorem.word();
		const missingKey = faker.string.uuid();
		await store.setMany([
			{ key: keyX, value: valX },
			{ key: keyY, value: valY },
			{ key: keyZ, value: valZ },
		]);
		const values = await store.getMany([keyX, keyY, keyZ, missingKey]);
		expect(values).toEqual([valX, valY, valZ, undefined]);
		expect(await store.hasMany([keyX, missingKey])).toEqual([true, false]);
		expect(await store.deleteMany([keyX, keyY])).toBe(true);
		expect(await store.get(keyX)).toBeUndefined();
		await store.disconnect();
	});

	it("clear works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	it("iterator works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		await store.set(faker.string.uuid(), faker.lorem.word());
		await store.set(faker.string.uuid(), faker.lorem.word());
		const entries: Array<[string, string]> = [];
		for await (const entry of store.iterator()) {
			entries.push(entry as [string, string]);
		}

		expect(entries.length).toBe(2);
		await store.disconnect();
	});

	it("WAL mode works with file-based database", async () => {
		const fs = await import("node:fs");
		const dbPath = "test/testdb-wal-sqlite3.sqlite";
		try {
			fs.unlinkSync(dbPath);
		} catch {}

		const store = new KeyvSqlite({
			uri: `sqlite://${dbPath}`,
			driver: createSqlite3Driver(sqlite3),
			wal: true,
		});
		const walKey = faker.string.uuid();
		const walVal = faker.lorem.word();
		await store.set(walKey, walVal);
		expect(await store.get(walKey)).toBe(walVal);
		await store.disconnect();

		try {
			fs.unlinkSync(dbPath);
			fs.unlinkSync(`${dbPath}-wal`);
			fs.unlinkSync(`${dbPath}-shm`);
		} catch {}
	});

	it("WAL mode on in-memory database logs warning", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
			wal: true,
		});
		await store.set(faker.string.uuid(), faker.lorem.word());
		expect(warnSpy).toHaveBeenCalledWith(
			"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
		);
		warnSpy.mockRestore();
		await store.disconnect();
	});

	it("busyTimeout option is accepted", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
			busyTimeout: 5000,
		});
		const btKey = faker.string.uuid();
		const btVal = faker.lorem.word();
		await store.set(btKey, btVal);
		expect(await store.get(btKey)).toBe(btVal);
		await store.disconnect();
	});

	it("works with sqlite3.verbose()", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3.verbose()),
		});
		const key = faker.string.uuid();
		const val = faker.lorem.word();
		await store.set(key, val);
		expect(await store.get(key)).toBe(val);
		await store.disconnect();
	});
});
