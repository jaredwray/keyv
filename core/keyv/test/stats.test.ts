import { describe, expect, it } from "vitest";
import { Keyv } from "../src/index.js";
import { KeyvStats } from "../src/stats.js";

it("will initialize at zero, increment counters, and handle errors", async () => {
	const stats = new KeyvStats({ enabled: true });
	expect(stats.hits).toBe(0);
	expect(stats.misses).toBe(0);
	expect(stats.sets).toBe(0);
	expect(stats.deletes).toBe(0);
	expect(stats.errors).toBe(0);

	const keyv = new Keyv({ stats: true });
	await keyv.set("key1", "value1");
	expect(keyv.stats.sets).toBe(1);
	await keyv.get("key1");
	expect(keyv.stats.hits).toBe(1);
	await keyv.get("missing");
	expect(keyv.stats.misses).toBe(1);
	await keyv.delete("key1");
	expect(keyv.stats.deletes).toBe(1);
});

it("will increment error counter on store error", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
	const errorStore = new Map() as any;
	const keyv = new Keyv({ store: errorStore, stats: true });
	keyv.on("error", () => {});
	errorStore.get = () => {
		throw new Error("store error");
	};
	await keyv.get("badkey");
	expect(keyv.stats.errors).toBe(1);
});

it("will not increment counters when disabled, and reset works", async () => {
	const keyv = new Keyv({ stats: false });
	await keyv.set("key1", "value1");
	await keyv.get("key1");
	expect(keyv.stats.sets).toBe(0);
	expect(keyv.stats.hits).toBe(0);

	// Reset
	const keyv2 = new Keyv({ stats: true });
	await keyv2.set("key1", "value1");
	await keyv2.get("key1");
	await keyv2.get("missing");
	await keyv2.delete("key1");
	keyv2.stats.reset();
	expect(keyv2.stats.sets).toBe(0);
	expect(keyv2.stats.hits).toBe(0);
	expect(keyv2.stats.misses).toBe(0);
	expect(keyv2.stats.deletes).toBe(0);
});

it("will default enabled to false and maxEntries to 1000", () => {
	const stats = new KeyvStats();
	expect(stats.enabled).toBe(false);
	expect(stats.maxEntries).toBe(1000);
});

it("will unsubscribe when enabled is set to false and re-subscribe on true", async () => {
	const keyv = new Keyv({ stats: true });
	await keyv.set("key1", "value1");
	expect(keyv.stats.sets).toBe(1);

	keyv.stats.enabled = false;
	await keyv.set("key2", "value2");
	expect(keyv.stats.sets).toBe(1);

	keyv.stats.enabled = true;
	await keyv.set("key3", "value3");
	expect(keyv.stats.sets).toBe(2);
});

describe("LRU key frequency maps", () => {
	it("should accept options and enforce maxEntries", () => {
		const stats = new KeyvStats({ enabled: true, maxEntries: 500 });
		expect(stats.maxEntries).toBe(500);

		// Default maxEntries eviction
		const stats2 = new KeyvStats({ enabled: true });
		for (let i = 0; i < 1001; i++) {
			stats2.incrementKeys(stats2.hitKeys, `key${i}`);
		}
		expect(stats2.hitKeys.size).toBe(1000);
	});

	it("should track keys, evict LRU, and preserve recently accessed", () => {
		const stats = new KeyvStats();
		stats.incrementKeys(stats.hitKeys, "user:123");
		stats.incrementKeys(stats.hitKeys, "user:123");
		stats.incrementKeys(stats.hitKeys, "user:456");
		expect(stats.hitKeys.get("user:123")).toBe(2);
		expect(stats.hitKeys.get("user:456")).toBe(1);

		// LRU eviction
		const stats2 = new KeyvStats({ maxEntries: 3 });
		stats2.incrementKeys(stats2.hitKeys, "a");
		stats2.incrementKeys(stats2.hitKeys, "b");
		stats2.incrementKeys(stats2.hitKeys, "c");
		stats2.incrementKeys(stats2.hitKeys, "d");
		expect(stats2.hitKeys.has("a")).toBe(false);
		expect(stats2.hitKeys.has("d")).toBe(true);
		expect(stats2.hitKeys.size).toBe(3);

		// Preserve recently accessed
		const stats3 = new KeyvStats({ maxEntries: 3 });
		stats3.incrementKeys(stats3.hitKeys, "a");
		stats3.incrementKeys(stats3.hitKeys, "b");
		stats3.incrementKeys(stats3.hitKeys, "c");
		stats3.incrementKeys(stats3.hitKeys, "a"); // re-access
		stats3.incrementKeys(stats3.hitKeys, "d");
		expect(stats3.hitKeys.has("a")).toBe(true);
		expect(stats3.hitKeys.get("a")).toBe(2);
		expect(stats3.hitKeys.has("b")).toBe(false);
	});

	it("should track each event type independently", () => {
		const stats = new KeyvStats();
		stats.incrementKeys(stats.hitKeys, "key1");
		stats.incrementKeys(stats.missKeys, "key1");
		stats.incrementKeys(stats.missKeys, "key1");
		stats.incrementKeys(stats.setKeys, "key2");
		stats.incrementKeys(stats.deleteKeys, "key3");
		stats.incrementKeys(stats.errorKeys, "key4");
		expect(stats.hitKeys.get("key1")).toBe(1);
		expect(stats.missKeys.get("key1")).toBe(2);
		expect(stats.setKeys.get("key2")).toBe(1);
		expect(stats.deleteKeys.get("key3")).toBe(1);
		expect(stats.errorKeys.get("key4")).toBe(1);
	});

	it("should build composite key with and without namespace", () => {
		const stats = new KeyvStats();
		expect(
			stats.buildKeyEventName({
				event: "hit",
				key: "user:123",
				namespace: "cache",
				timestamp: Date.now(),
			}),
		).toBe("cache:user:123");
		expect(stats.buildKeyEventName({ event: "hit", key: "user:123", timestamp: Date.now() })).toBe(
			"user:123",
		);
		expect(stats.buildKeyEventName({ event: "error", timestamp: Date.now() })).toBe("");
	});

	it("should not track empty keys or when maxEntries is 0", () => {
		const stats = new KeyvStats();
		stats.incrementKeys(stats.errorKeys, "");
		expect(stats.errorKeys.size).toBe(0);

		const stats2 = new KeyvStats({ maxEntries: 0 });
		stats2.incrementKeys(stats2.hitKeys, "key1");
		expect(stats2.hitKeys.size).toBe(0);
	});

	it("should clear all LRU maps on reset", () => {
		const stats = new KeyvStats();
		stats.incrementKeys(stats.hitKeys, "a");
		stats.incrementKeys(stats.missKeys, "b");
		stats.incrementKeys(stats.setKeys, "c");
		stats.incrementKeys(stats.deleteKeys, "d");
		stats.incrementKeys(stats.errorKeys, "e");
		stats.reset();
		expect(stats.hitKeys.size).toBe(0);
		expect(stats.missKeys.size).toBe(0);
	});

	it("should populate LRU maps via subscribe with namespace", async () => {
		const keyv = new Keyv({ stats: true, namespace: "myns" });
		await keyv.set("foo", "bar");
		await keyv.get("foo");
		await keyv.get("missing");
		await keyv.delete("foo");
		expect(keyv.stats.setKeys.get("myns:foo")).toBe(1);
		expect(keyv.stats.hitKeys.get("myns:foo")).toBe(1);
		expect(keyv.stats.missKeys.get("myns:missing")).toBe(1);
		expect(keyv.stats.deleteKeys.get("myns:foo")).toBe(1);
	});

	it("should track error keys via subscribe", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		const keyv = new Keyv({ store: errorStore, stats: true });
		keyv.on("error", () => {});
		errorStore.get = () => {
			throw new Error("store error");
		};
		await keyv.get("badkey");
		expect(keyv.stats.errorKeys.get("badkey")).toBe(1);
	});
});

describe("unsubscribe", () => {
	it("should stop tracking and be safe to call multiple times", async () => {
		const keyv = new Keyv({ stats: true });
		await keyv.set("key1", "value1");
		keyv.stats.unsubscribe();
		await keyv.set("key2", "value2");
		expect(keyv.stats.sets).toBe(1);
		expect(keyv.stats.setKeys.has("key2")).toBe(false);

		// Safe without subscribe and multiple times
		expect(() => new KeyvStats().unsubscribe()).not.toThrow();
		keyv.stats.unsubscribe();
		expect(keyv.stats.sets).toBe(1);
	});
});
