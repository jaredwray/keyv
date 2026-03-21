import sqlite3 from "sqlite3";
import { describe, expect, it, vi } from "vitest";
import { resolveDriver } from "../src/drivers/index.js";
import type { SqliteDriver } from "../src/drivers/types.js";
import KeyvSqlite, { createSqlite3Driver } from "../src/index.js";

describe("driver selection", () => {
	it("auto-detects better-sqlite3 by default", async () => {
		const store = new KeyvSqlite("sqlite://:memory:");
		await store.set("key1", "val1");
		expect(await store.get("key1")).toBe("val1");
		await store.disconnect();
	});

	it("accepts explicit driver: 'better-sqlite3'", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		await store.set("key1", "val1");
		expect(await store.get("key1")).toBe("val1");
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
		await store.set("custom", "driver");
		expect(await store.get("custom")).toBe("driver");
		await store.disconnect();
	});
});

describe("better-sqlite3 driver operations", () => {
	it("get/set/delete/has work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		await store.set("a", "1");
		await store.set("b", "2");
		expect(await store.get("a")).toBe("1");
		expect(await store.has("a")).toBe(true);
		expect(await store.has("missing")).toBe(false);
		expect(await store.delete("a")).toBe(true);
		expect(await store.get("a")).toBeUndefined();
		await store.disconnect();
	});

	it("getMany/setMany/deleteMany/hasMany work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		await store.setMany([
			{ key: "x", value: "1" },
			{ key: "y", value: "2" },
			{ key: "z", value: "3" },
		]);
		const values = await store.getMany(["x", "y", "z", "missing"]);
		expect(values).toEqual(["1", "2", "3", undefined]);
		expect(await store.hasMany(["x", "missing"])).toEqual([true, false]);
		expect(await store.deleteMany(["x", "y"])).toBe(true);
		expect(await store.get("x")).toBeUndefined();
		await store.disconnect();
	});

	it("clear works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		await store.set("a", "1");
		await store.clear();
		expect(await store.get("a")).toBeUndefined();
		await store.disconnect();
	});

	it("iterator works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: "better-sqlite3",
		});
		await store.set("i1", "v1");
		await store.set("i2", "v2");
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
		await store.set("walkey", "walval");
		expect(await store.get("walkey")).toBe("walval");
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
		await store.set("k", "v");
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
		await store.set("bt", "val");
		expect(await store.get("bt")).toBe("val");
		await store.disconnect();
	});
});

describe("sqlite3 helper driver", () => {
	it("basic set/get with in-memory db", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		await store.set("key1", "val1");
		expect(await store.get("key1")).toBe("val1");
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
		await store.set("a", "1");
		await store.set("b", "2");
		expect(await store.get("a")).toBe("1");
		expect(await store.has("a")).toBe(true);
		expect(await store.has("missing")).toBe(false);
		expect(await store.delete("a")).toBe(true);
		expect(await store.get("a")).toBeUndefined();
		await store.disconnect();
	});

	it("getMany/setMany/deleteMany/hasMany work correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		await store.setMany([
			{ key: "x", value: "1" },
			{ key: "y", value: "2" },
			{ key: "z", value: "3" },
		]);
		const values = await store.getMany(["x", "y", "z", "missing"]);
		expect(values).toEqual(["1", "2", "3", undefined]);
		expect(await store.hasMany(["x", "missing"])).toEqual([true, false]);
		expect(await store.deleteMany(["x", "y"])).toBe(true);
		expect(await store.get("x")).toBeUndefined();
		await store.disconnect();
	});

	it("clear works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		await store.set("a", "1");
		await store.clear();
		expect(await store.get("a")).toBeUndefined();
		await store.disconnect();
	});

	it("iterator works correctly", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3),
		});
		await store.set("i1", "v1");
		await store.set("i2", "v2");
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
		await store.set("walkey", "walval");
		expect(await store.get("walkey")).toBe("walval");
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
		await store.set("k", "v");
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
		await store.set("bt", "val");
		expect(await store.get("bt")).toBe("val");
		await store.disconnect();
	});

	it("works with sqlite3.verbose()", async () => {
		const store = new KeyvSqlite({
			uri: "sqlite://:memory:",
			driver: createSqlite3Driver(sqlite3.verbose()),
		});
		await store.set("verbose", "test");
		expect(await store.get("verbose")).toBe("test");
		await store.disconnect();
	});
});
