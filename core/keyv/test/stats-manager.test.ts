import { describe, expect, it } from "vitest";
import { Keyv } from "../src/index.js";
import { KeyvStats } from "../src/stats.js";

it("will initialize with correct stats at zero", () => {
	const stats = new KeyvStats({ enabled: true });
	expect(stats.hits).toBe(0);
	expect(stats.misses).toBe(0);
	expect(stats.sets).toBe(0);
	expect(stats.deletes).toBe(0);
	expect(stats.errors).toBe(0);
});

it("will increment counters via Keyv events", async () => {
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
	keyv.on("error", () => {}); // suppress unhandled error

	errorStore.get = () => {
		throw new Error("store error");
	};

	await keyv.get("badkey");
	expect(keyv.stats.errors).toBe(1);
});

it("will not increment counters when disabled", async () => {
	const keyv = new Keyv({ stats: false });

	await keyv.set("key1", "value1");
	await keyv.get("key1");

	expect(keyv.stats.sets).toBe(0);
	expect(keyv.stats.hits).toBe(0);
});

it("will reset stats", async () => {
	const keyv = new Keyv({ stats: true });

	await keyv.set("key1", "value1");
	await keyv.get("key1");
	await keyv.get("missing");
	await keyv.delete("key1");

	expect(keyv.stats.sets).toBe(1);
	expect(keyv.stats.hits).toBe(1);
	expect(keyv.stats.misses).toBe(1);
	expect(keyv.stats.deletes).toBe(1);

	keyv.stats.reset();

	expect(keyv.stats.sets).toBe(0);
	expect(keyv.stats.hits).toBe(0);
	expect(keyv.stats.misses).toBe(0);
	expect(keyv.stats.deletes).toBe(0);
	expect(keyv.stats.errors).toBe(0);
});

it("will default enabled to false", () => {
	const stats = new KeyvStats();
	expect(stats.enabled).toBe(false);
});

it("will default maxEntries to 1000", () => {
	const stats = new KeyvStats();
	expect(stats.maxEntries).toBe(1000);
});

it("will unsubscribe when enabled is set to false", async () => {
	const keyv = new Keyv({ stats: true });

	await keyv.set("key1", "value1");
	expect(keyv.stats.sets).toBe(1);

	keyv.stats.enabled = false;

	await keyv.set("key2", "value2");
	expect(keyv.stats.sets).toBe(1);
});

describe("LRU key frequency maps", () => {
	it("should accept KeyvStatsOptions object", () => {
		const stats = new KeyvStats({ enabled: true, maxEntries: 500 });
		expect(stats.enabled).toBe(true);
		expect(stats.maxEntries).toBe(500);
	});

	it("should default maxEntries to 1000", () => {
		const stats = new KeyvStats({ enabled: true });
		// Fill past default and verify eviction happens at 1000
		for (let i = 0; i < 1001; i++) {
			stats.incrementKeys(stats.hitKeys, `key${i}`);
		}

		expect(stats.hitKeys.size).toBe(1000);
	});

	it("should track hit keys via incrementKeys", () => {
		const stats = new KeyvStats();
		stats.incrementKeys(stats.hitKeys, "user:123");
		stats.incrementKeys(stats.hitKeys, "user:123");
		stats.incrementKeys(stats.hitKeys, "user:456");

		expect(stats.hitKeys.get("user:123")).toBe(2);
		expect(stats.hitKeys.get("user:456")).toBe(1);
	});

	it("should evict least recently used key when map exceeds maxEntries", () => {
		const stats = new KeyvStats({ maxEntries: 3 });

		stats.incrementKeys(stats.hitKeys, "a");
		stats.incrementKeys(stats.hitKeys, "b");
		stats.incrementKeys(stats.hitKeys, "c");
		// Map is now full: a, b, c
		stats.incrementKeys(stats.hitKeys, "d");
		// "a" should be evicted as LRU

		expect(stats.hitKeys.has("a")).toBe(false);
		expect(stats.hitKeys.has("b")).toBe(true);
		expect(stats.hitKeys.has("c")).toBe(true);
		expect(stats.hitKeys.has("d")).toBe(true);
		expect(stats.hitKeys.size).toBe(3);
	});

	it("should preserve recently accessed keys during eviction", () => {
		const stats = new KeyvStats({ maxEntries: 3 });

		stats.incrementKeys(stats.hitKeys, "a");
		stats.incrementKeys(stats.hitKeys, "b");
		stats.incrementKeys(stats.hitKeys, "c");
		// Re-access "a" to move it to most recent
		stats.incrementKeys(stats.hitKeys, "a");
		// Now insertion order is: b, c, a
		stats.incrementKeys(stats.hitKeys, "d");
		// "b" should be evicted, not "a"

		expect(stats.hitKeys.has("a")).toBe(true);
		expect(stats.hitKeys.get("a")).toBe(2);
		expect(stats.hitKeys.has("b")).toBe(false);
		expect(stats.hitKeys.has("c")).toBe(true);
		expect(stats.hitKeys.has("d")).toBe(true);
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

	it("should build composite key with namespace", () => {
		const stats = new KeyvStats();
		const compositeKey = stats.buildKeyEventName({
			event: "hit",
			key: "user:123",
			namespace: "cache",
			timestamp: Date.now(),
		});
		expect(compositeKey).toBe("cache:user:123");
	});

	it("should build key without namespace", () => {
		const stats = new KeyvStats();
		const compositeKey = stats.buildKeyEventName({
			event: "hit",
			key: "user:123",
			timestamp: Date.now(),
		});
		expect(compositeKey).toBe("user:123");
	});

	it("should return empty string when no key", () => {
		const stats = new KeyvStats();
		const compositeKey = stats.buildKeyEventName({
			event: "error",
			timestamp: Date.now(),
		});
		expect(compositeKey).toBe("");
	});

	it("should not track keys when compositeKey is empty", () => {
		const stats = new KeyvStats();
		stats.incrementKeys(stats.errorKeys, "");
		expect(stats.errorKeys.size).toBe(0);
	});

	it("should not track keys when maxEntries is 0", () => {
		const stats = new KeyvStats({ maxEntries: 0 });
		stats.incrementKeys(stats.hitKeys, "key1");
		expect(stats.hitKeys.size).toBe(0);
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
		expect(stats.setKeys.size).toBe(0);
		expect(stats.deleteKeys.size).toBe(0);
		expect(stats.errorKeys.size).toBe(0);
	});

	it("should populate LRU maps via subscribe on a Keyv instance", async () => {
		const keyv = new Keyv({ stats: true });

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.get("key1"); // hit
		await keyv.get("missing"); // miss
		await keyv.delete("key2"); // delete

		expect(keyv.stats.setKeys.get("key1")).toBe(1);
		expect(keyv.stats.setKeys.get("key2")).toBe(1);
		expect(keyv.stats.hitKeys.get("key1")).toBe(1);
		expect(keyv.stats.missKeys.get("missing")).toBe(1);
		expect(keyv.stats.deleteKeys.get("key2")).toBe(1);
	});

	it("should populate LRU maps with namespace prefix via subscribe", async () => {
		const keyv = new Keyv({ stats: true, namespace: "myns" });

		await keyv.set("foo", "bar");
		await keyv.get("foo");

		expect(keyv.stats.setKeys.get("myns:foo")).toBe(1);
		expect(keyv.stats.hitKeys.get("myns:foo")).toBe(1);
	});

	it("should track error keys via subscribe", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing with Map as store
		const errorStore = new Map() as any;
		const keyv = new Keyv({ store: errorStore, stats: true });
		keyv.on("error", () => {}); // suppress unhandled error

		errorStore.get = () => {
			throw new Error("store error");
		};

		await keyv.get("badkey");

		expect(keyv.stats.errorKeys.get("badkey")).toBe(1);
	});

	it("counters and LRU maps work together", async () => {
		const keyv = new Keyv({ stats: true });

		await keyv.set("a", 1);
		await keyv.get("a");
		await keyv.get("missing");

		expect(keyv.stats.sets).toBe(1);
		expect(keyv.stats.hits).toBe(1);
		expect(keyv.stats.misses).toBe(1);
		expect(keyv.stats.setKeys.size).toBe(1);
		expect(keyv.stats.hitKeys.size).toBe(1);
		expect(keyv.stats.missKeys.size).toBe(1);
	});
});

describe("unsubscribe", () => {
	it("should stop tracking events after unsubscribe", async () => {
		const keyv = new Keyv({ stats: true });

		await keyv.set("key1", "value1");
		expect(keyv.stats.sets).toBe(1);

		keyv.stats.unsubscribe();

		await keyv.set("key2", "value2");
		expect(keyv.stats.sets).toBe(1);
		expect(keyv.stats.setKeys.has("key2")).toBe(false);
	});

	it("should be safe to call unsubscribe without subscribe", () => {
		const stats = new KeyvStats();
		expect(() => stats.unsubscribe()).not.toThrow();
	});

	it("should be safe to call unsubscribe multiple times", async () => {
		const keyv = new Keyv({ stats: true });
		await keyv.set("key1", "value1");

		keyv.stats.unsubscribe();
		keyv.stats.unsubscribe();

		expect(keyv.stats.sets).toBe(1);
	});

	it("should re-subscribe when enabled is set back to true", async () => {
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
});
