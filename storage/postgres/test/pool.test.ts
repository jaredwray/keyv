import { describe, expect, test } from "vitest";
import { createPoolManager } from "../src/pool.js";

describe("pool manager", () => {
	test("endPool is a no-op when no pool exists", async () => {
		const manager = createPoolManager();
		await manager.endPool("postgresql://localhost:5432");
	});

	test("reuses a pool until the last reference is released", async () => {
		const manager = createPoolManager();
		const uri = "postgresql://localhost:5432";
		const first = manager.getPool(uri);
		const second = manager.getPool(uri);
		expect(first).toBe(second);
		await manager.endPool(uri);
		const stillOpen = manager.getPool(uri);
		expect(stillOpen).toBe(first);
		await manager.endPool(uri);
		await manager.endPool(uri);
	});

	test("treats option key order as the same pool", async () => {
		const manager = createPoolManager();
		const uri = "postgresql://localhost:5432";
		const first = manager.getPool(uri, { max: 2, idleTimeoutMillis: 1000 });
		const second = manager.getPool(uri, { idleTimeoutMillis: 1000, max: 2 });
		expect(first).toBe(second);
		await manager.endAllPools();
	});

	test("endAllPools closes remaining pools and can be called when empty", async () => {
		const manager = createPoolManager();
		manager.getPool("postgresql://localhost:5432");
		await manager.endAllPools();
		await manager.endAllPools();
	});
});
