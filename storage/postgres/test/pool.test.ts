import { describe, expect, test } from "vitest";
import { createPoolManager, endPool, pool, releasePool } from "../src/pool.js";

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

	test("releasePool releases the pool it is given until the last reference", async () => {
		const manager = createPoolManager();
		const uri = "postgresql://localhost:5432";
		const pool = manager.getPool(uri, { max: 2 });
		manager.getPool(uri, { max: 2 });
		await manager.releasePool(pool);
		expect(pool.ended).toBe(false);
		await manager.releasePool(pool);
		expect(pool.ended).toBe(true);
		await manager.releasePool(pool);
		expect(manager.getPool(uri, { max: 2 })).not.toBe(pool);
		await manager.endAllPools();
	});

	test("the shared pool exports take and release references", async () => {
		const uri = "postgresql://localhost:5432/shared-pool-exports";
		const first = pool(uri);
		const second = pool(uri);
		expect(second).toBe(first);
		await endPool(uri);
		expect(first.ended).toBe(false);
		await releasePool(second);
		expect(first.ended).toBe(true);
	});

	test("endAllPools closes remaining pools and can be called when empty", async () => {
		const manager = createPoolManager();
		manager.getPool("postgresql://localhost:5432");
		await manager.endAllPools();
		await manager.endAllPools();
	});
});
