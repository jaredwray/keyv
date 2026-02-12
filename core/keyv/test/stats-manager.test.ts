import * as test from "vitest";
import KeyvStatsManager from "../src/stats-manager.js";

test.it("will initialize with correct stats at zero", () => {
	const stats = new KeyvStatsManager();
	test.expect(stats.hits).toBe(0);
});

test.it("will increment hits", () => {
	const stats = new KeyvStatsManager();
	stats.hit();
	test.expect(stats.hits).toBe(1);
});

test.it("will increment misses", () => {
	const stats = new KeyvStatsManager();
	stats.miss();
	test.expect(stats.misses).toBe(1);
});

test.it("will increment sets", () => {
	const stats = new KeyvStatsManager();
	stats.set();
	test.expect(stats.sets).toBe(1);
});

test.it("will increment deletes", () => {
	const stats = new KeyvStatsManager();
	stats.delete();
	test.expect(stats.deletes).toBe(1);
});

test.it("will reset stats", () => {
	const stats = new KeyvStatsManager();
	stats.hit();
	stats.miss();
	stats.set();
	stats.delete();
	test.expect(stats.hits).toBe(1);
	test.expect(stats.misses).toBe(1);
	test.expect(stats.sets).toBe(1);
	test.expect(stats.deletes).toBe(1);
	stats.reset();
	test.expect(stats.hits).toBe(0);
	test.expect(stats.misses).toBe(0);
	test.expect(stats.sets).toBe(0);
	test.expect(stats.deletes).toBe(0);
});

test.it("will not increment hits if disabled", () => {
	const stats = new KeyvStatsManager(false);
	stats.hit();
	test.expect(stats.hits).toBe(0);
});
