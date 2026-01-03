import { createLRU } from "lru.min";
import QuickLRU from "quick-lru";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvGenericStore } from "../src/generic-store.js";

// eslint-disable-next-line no-promise-executor-return
const sleep = async (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

describe("KeyvGenericStore with QuickLRU - Store Options", () => {
	test("should accept QuickLRU as the store", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(keyv.store).toBe(lru);
	});

	test("should allow replacing the store", () => {
		const lru1 = new QuickLRU<string, unknown>({ maxSize: 100 });
		const lru2 = new QuickLRU<string, unknown>({ maxSize: 200 });
		const keyv = new KeyvGenericStore(lru1);
		expect(keyv.store).toBe(lru1);
		keyv.store = lru2;
		expect(keyv.store).toBe(lru2);
	});

	test("should set the namespace option with QuickLRU", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "test" });
		expect(keyv.namespace).toBe("test");
	});

	test("should be able to set and get the keySeparator with QuickLRU", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { keySeparator: ":" });
		expect(keyv.keySeparator).toBe(":");
		keyv.keySeparator = "||";
		expect(keyv.keySeparator).toBe("||");
	});

	test("should be able to get the options", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const options = { namespace: "test", keySeparator: ":" };
		const keyv = new KeyvGenericStore(lru, options);
		expect(keyv.opts).toEqual(options);
	});
});

describe("KeyvGenericStore with QuickLRU - LRU Eviction Behavior", () => {
	/**
	 * Note: QuickLRU uses a double-buffer (hashlru) algorithm for performance.
	 * When the cache exceeds maxSize, it doesn't immediately evict the oldest item.
	 * Instead, it swaps buffers and items in the old buffer are only evicted when
	 * accessed (lazy eviction). Items accessed after buffer swap are promoted to
	 * the new buffer, but only up to maxSize items.
	 */

	test("should evict entries when cache exceeds capacity and entries are accessed", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// All three should exist
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});

		// Add a fourth entry - this triggers buffer swap
		// Old buffer: key1, key2, key3
		// New buffer: key4
		await keyv.set("key4", "value4");

		// key4 is in the new buffer
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});

		// key1 gets promoted to new buffer (now has: key4, key1)
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});

		// key2 gets promoted to new buffer (now has: key4, key1, key2 = maxSize)
		expect(await keyv.get("key2")).toStrictEqual({
			value: "value2",
			expires: undefined,
		});

		// key3 cannot be promoted (new buffer at maxSize) - evicted
		expect(await keyv.get("key3")).toBe(undefined);
	});

	test("should track size correctly", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 10 });
		const keyv = new KeyvGenericStore(lru);

		expect(lru.size).toBe(0);

		await keyv.set("key1", "value1");
		expect(lru.size).toBe(1);

		await keyv.set("key2", "value2");
		expect(lru.size).toBe(2);

		await keyv.delete("key1");
		expect(lru.size).toBe(1);

		await keyv.clear();
		expect(lru.size).toBe(0);
	});

	test("should evict all old buffer entries when new buffer fills up", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = new KeyvGenericStore(lru);

		// Fill the cache
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Add 3 more entries - these go to new buffer after swap
		await keyv.set("key4", "value4");
		await keyv.set("key5", "value5");
		await keyv.set("key6", "value6");

		// key4, key5, key6 should be in the new buffer
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
		expect(await keyv.get("key5")).toStrictEqual({
			value: "value5",
			expires: undefined,
		});
		expect(await keyv.get("key6")).toStrictEqual({
			value: "value6",
			expires: undefined,
		});

		// key1, key2, key3 are evicted (new buffer is full, can't promote)
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toBe(undefined);
	});

	test("should update LRU order - accessed items get promoted", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Access key1 first to make it recently used
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});

		// Add key4 - triggers buffer swap
		// Old buffer: key1, key2, key3
		// New buffer: key4
		await keyv.set("key4", "value4");

		// Access key1 again - it gets promoted to new buffer
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});

		// Add key5 - goes to new buffer (now: key4, key1, key5 = maxSize)
		await keyv.set("key5", "value5");

		// key2 and key3 cannot be promoted - they're evicted
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toBe(undefined);

		// key1, key4, key5 should still be accessible
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
		expect(await keyv.get("key5")).toStrictEqual({
			value: "value5",
			expires: undefined,
		});
	});

	test("should handle updating existing keys without eviction", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Update existing key - should not cause eviction
		await keyv.set("key1", "updated1");

		expect(lru.size).toBe(3);
		expect(await keyv.get("key1")).toStrictEqual({
			value: "updated1",
			expires: undefined,
		});
		expect(await keyv.get("key2")).toStrictEqual({
			value: "value2",
			expires: undefined,
		});
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});

	test("should respect maxSize limit", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 2 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		expect(lru.size).toBe(2);

		// Add a 3rd item - triggers buffer swap
		await keyv.set("key3", "value3");
		expect(lru.size).toBe(2);

		// key3 is in new buffer
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});
});

describe("KeyvGenericStore with QuickLRU - Basic CRUD Operations", () => {
	test("should set and get a value", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set many keys", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		const result = await keyv.setMany([
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
		]);
		expect(await keyv.get("key1")).toStrictEqual({
			expires: undefined,
			value: "value1",
		});
		expect(await keyv.get("key2")).toStrictEqual({
			expires: undefined,
			value: "value2",
		});
		expect(result).toBeUndefined();
	});

	test("should get undefined for non-existent key", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(await keyv.get("nonexistent")).toBe(undefined);
	});

	test("should handle get with TTL and expiration", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", { val: "value1" }, 10);
		await sleep(20);
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should handle has", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		expect(await keyv.has("key1")).toBe(true);
		expect(await keyv.has("key2")).toBe(false);
	});

	test("should be able to get many keys", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		const values = await keyv.getMany(["key1", "key2", "key3", "key4"]);
		expect(values[0]).toStrictEqual({ value: "value1", expires: undefined });
		expect(values[1]).toStrictEqual({ value: "value2", expires: undefined });
		expect(values[2]).toStrictEqual({ value: "value3", expires: undefined });
		expect(values[3]).toBe(undefined);
	});

	test("should store complex objects", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		const complexValue = {
			name: "test",
			nested: { a: 1, b: [1, 2, 3] },
			date: new Date("2024-01-01"),
		};
		await keyv.set("complex", complexValue);
		const result = await keyv.get("complex");
		expect(result).toStrictEqual({
			value: complexValue,
			expires: undefined,
		});
	});
});

describe("KeyvGenericStore with QuickLRU - Delete / Clear Operations", () => {
	test("should delete a key", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.delete("key1");
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should clear all keys", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.clear();
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(lru.size).toBe(0);
	});

	test("should delete many keys", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});

	test("should emit error on delete many keys failure", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		// Override delete to throw an error
		lru.delete = () => {
			throw new Error("delete error");
		};

		const keyv = new KeyvGenericStore(lru);
		let errorEmitted = false;
		keyv.on("error", (error) => {
			expect(error.message).toBe("delete error");
			errorEmitted = true;
		});
		await keyv.deleteMany(["key1", "key2"]);
		expect(errorEmitted).toBe(true);
	});
});

describe("KeyvGenericStore with QuickLRU - Namespace", () => {
	test("should return the namespace if it is a string", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "test" });
		expect(keyv.getNamespace()).toBe("test");
	});

	test("should return the namespace if it is a function", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: () => "test" });
		expect(keyv.getNamespace()).toBe("test");
	});

	test("should set the namespace", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		keyv.namespace = "test";
		expect(keyv.namespace).toBe("test");
	});

	test("should set the namespace as a function", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(keyv.namespace).toBe(undefined);
		keyv.setNamespace(() => "test");
		expect(keyv.namespace).toBe("test");
	});

	test("should set the key prefix", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(keyv.getKeyPrefix("key1", "ns1")).toBe("ns1::key1");
		expect(keyv.getKeyPrefix("key1")).toBe("key1");
	});

	test("should get the key prefix data", () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(keyv.getKeyPrefixData("ns1::key1")).toEqual({
			key: "key1",
			namespace: "ns1",
		});
		expect(keyv.getKeyPrefixData("key1")).toEqual({
			key: "key1",
			namespace: undefined,
		});
	});

	test("should store and retrieve with namespace", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "myns" });

		await keyv.set("key1", "value1");

		// Verify the key is stored with namespace prefix
		expect(lru.has("myns::key1")).toBe(true);
		expect(lru.has("key1")).toBe(false);

		// Should still be retrievable via KeyvGenericStore
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});
});

describe("KeyvGenericStore with QuickLRU - Iterator", () => {
	test("should iterate over all entries", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(3);
		expect(entries.map(([key]) => key).sort()).toEqual([
			"key1",
			"key2",
			"key3",
		]);
	});

	test("should filter by namespace", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);

		// Set entries with different namespaces manually
		lru.set("ns1::key1", { value: "value1", expires: undefined });
		lru.set("ns1::key2", { value: "value2", expires: undefined });
		lru.set("ns2::key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should skip expired entries and delete them", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru);

		// Set a valid entry
		await keyv.set("key1", "value1");

		// Set an expired entry manually
		lru.set("key2", { value: "value2", expires: Date.now() - 1000 });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe("key1");

		// Verify expired entry was deleted
		expect(lru.has("key2")).toBe(false);
	});

	test("should strip namespace prefix from keys when iterating with namespace", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "myns" });

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("myns")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		// Keys should not have namespace prefix
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should work with custom key separator", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { keySeparator: ":" });

		// Set entries with custom separator manually
		lru.set("ns1:key1", { value: "value1", expires: undefined });
		lru.set("ns1:key2", { value: "value2", expires: undefined });
		lru.set("ns2:key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});
});

describe("KeyvGenericStore with QuickLRU - createKeyv() Integration", () => {
	test("should work with createKeyv helper", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = createKeyv(lru);

		await keyv.set("key1", "value1");
		const result = await keyv.get("key1");
		expect(result).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set many items and then get them", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = createKeyv(lru);

		const testData = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
			{ key: "key3", value: "value3" },
		];

		await keyv.setMany(testData);
		const result = await keyv.getMany(testData.map((d) => d.key));
		expect(result.length).toBe(3);
	});

	test("should handle batch operations", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = createKeyv(lru);

		const testData = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
			{ key: "key3", value: "value3" },
			{ key: "key4", value: "value4" },
			{ key: "key5", value: "value5" },
		];

		await keyv.setMany(testData);
		const testKeys = testData.map((d) => d.key);

		// Get many
		const getResult = await keyv.getMany(testKeys);
		expect(getResult.length).toBe(5);

		// Has many
		const hasResult = await keyv.has(testKeys);
		expect(hasResult.length).toBe(5);
		expect(hasResult.every((r) => r === true)).toBe(true);

		// Delete many
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.has("key3")).toBe(true);
	});

	test("should work with namespace option via KeyvGenericStore directly", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "tenant1" });

		await keyv.set("user", "john");
		expect(await keyv.get("user")).toStrictEqual({
			value: "john",
			expires: undefined,
		});

		// Verify it's stored with namespace prefix in the underlying LRU
		expect(lru.has("tenant1::user")).toBe(true);
	});

	test("should respect LRU eviction with createKeyv", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = createKeyv(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Add 3 more entries to fill new buffer and evict old ones
		await keyv.set("key4", "value4");
		await keyv.set("key5", "value5");
		await keyv.set("key6", "value6");

		// key4, key5, key6 are in new buffer
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
		expect(await keyv.get("key5")).toStrictEqual({
			value: "value5",
			expires: undefined,
		});
		expect(await keyv.get("key6")).toStrictEqual({
			value: "value6",
			expires: undefined,
		});

		// key1, key2, key3 are evicted (new buffer is full)
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toBe(undefined);
	});

	test("should handle TTL with createKeyv", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = createKeyv(lru);

		await keyv.set("expiring", "value", 10);
		await sleep(20);
		expect(await keyv.get("expiring")).toBe(undefined);
	});
});

// ============================================================================
// lru.min Tests
// ============================================================================

describe("KeyvGenericStore with lru.min - Store Options", () => {
	test("should accept lru.min as the store", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(keyv.store).toBe(lru);
	});

	test("should allow replacing the store", () => {
		const lru1 = createLRU<string, unknown>({ max: 100 });
		const lru2 = createLRU<string, unknown>({ max: 200 });
		const keyv = new KeyvGenericStore(lru1);
		expect(keyv.store).toBe(lru1);
		keyv.store = lru2;
		expect(keyv.store).toBe(lru2);
	});

	test("should set the namespace option with lru.min", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "test" });
		expect(keyv.namespace).toBe("test");
	});

	test("should be able to set and get the keySeparator with lru.min", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru, { keySeparator: ":" });
		expect(keyv.keySeparator).toBe(":");
		keyv.keySeparator = "||";
		expect(keyv.keySeparator).toBe("||");
	});

	test("should be able to get the options", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const options = { namespace: "test", keySeparator: ":" };
		const keyv = new KeyvGenericStore(lru, options);
		expect(keyv.opts).toEqual(options);
	});
});

describe("KeyvGenericStore with lru.min - LRU Eviction Behavior", () => {
	test("should evict oldest entry when max is exceeded", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Add a fourth entry - should evict key1 (oldest, not accessed)
		await keyv.set("key4", "value4");

		// key1 should be evicted (lru.min uses standard LRU eviction)
		expect(await keyv.get("key1")).toBe(undefined);

		// key2, key3, key4 should still exist
		expect(await keyv.get("key2")).toStrictEqual({
			value: "value2",
			expires: undefined,
		});
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
	});

	test("should track size correctly", async () => {
		const lru = createLRU<string, unknown>({ max: 10 });
		const keyv = new KeyvGenericStore(lru);

		expect(lru.size).toBe(0);

		await keyv.set("key1", "value1");
		expect(lru.size).toBe(1);

		await keyv.set("key2", "value2");
		expect(lru.size).toBe(2);

		await keyv.delete("key1");
		expect(lru.size).toBe(1);

		await keyv.clear();
		expect(lru.size).toBe(0);
	});

	test("should evict multiple entries when adding items exceeding capacity", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Add two more entries
		await keyv.set("key4", "value4");
		await keyv.set("key5", "value5");

		// key1 and key2 should be evicted (oldest)
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);

		// key3, key4, key5 should exist
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
		expect(await keyv.get("key5")).toStrictEqual({
			value: "value5",
			expires: undefined,
		});
	});

	test("should update LRU order on get (most recently accessed stays)", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Access key1 to make it most recently used
		await keyv.get("key1");

		// Add a new entry - key2 should be evicted (now oldest)
		await keyv.set("key4", "value4");

		// key2 should be evicted
		expect(await keyv.get("key2")).toBe(undefined);

		// key1, key3, key4 should still exist
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
	});

	test("should handle updating existing keys without eviction", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		// Update existing key - should not cause eviction
		await keyv.set("key1", "updated1");

		expect(lru.size).toBe(3);
		expect(await keyv.get("key1")).toStrictEqual({
			value: "updated1",
			expires: undefined,
		});
		expect(await keyv.get("key2")).toStrictEqual({
			value: "value2",
			expires: undefined,
		});
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});

	test("should support onEviction callback", async () => {
		const evictedItems: Array<{ key: string; value: unknown }> = [];
		const lru = createLRU<string, unknown>({
			max: 2,
			onEviction: (key, value) => {
				evictedItems.push({ key, value });
			},
		});
		const keyv = new KeyvGenericStore(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3"); // This should evict key1

		expect(evictedItems.length).toBe(1);
		expect(evictedItems[0].key).toBe("key1");
	});
});

describe("KeyvGenericStore with lru.min - Basic CRUD Operations", () => {
	test("should set and get a value", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set many keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		const result = await keyv.setMany([
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
		]);
		expect(await keyv.get("key1")).toStrictEqual({
			expires: undefined,
			value: "value1",
		});
		expect(await keyv.get("key2")).toStrictEqual({
			expires: undefined,
			value: "value2",
		});
		expect(result).toBeUndefined();
	});

	test("should get undefined for non-existent key", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(await keyv.get("nonexistent")).toBe(undefined);
	});

	test("should handle get with TTL and expiration", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", { val: "value1" }, 10);
		await sleep(20);
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should handle has", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		expect(await keyv.has("key1")).toBe(true);
		expect(await keyv.has("key2")).toBe(false);
	});

	test("should be able to get many keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		const values = await keyv.getMany(["key1", "key2", "key3", "key4"]);
		expect(values[0]).toStrictEqual({ value: "value1", expires: undefined });
		expect(values[1]).toStrictEqual({ value: "value2", expires: undefined });
		expect(values[2]).toStrictEqual({ value: "value3", expires: undefined });
		expect(values[3]).toBe(undefined);
	});

	test("should store complex objects", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		const complexValue = {
			name: "test",
			nested: { a: 1, b: [1, 2, 3] },
			date: new Date("2024-01-01"),
		};
		await keyv.set("complex", complexValue);
		const result = await keyv.get("complex");
		expect(result).toStrictEqual({
			value: complexValue,
			expires: undefined,
		});
	});
});

describe("KeyvGenericStore with lru.min - Delete / Clear Operations", () => {
	test("should delete a key", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.delete("key1");
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should clear all keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.clear();
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(lru.size).toBe(0);
	});

	test("should delete many keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});
});

describe("KeyvGenericStore with lru.min - Namespace", () => {
	test("should store and retrieve with namespace", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru, { namespace: "myns" });

		await keyv.set("key1", "value1");

		// Verify the key is stored with namespace prefix
		expect(lru.has("myns::key1")).toBe(true);
		expect(lru.has("key1")).toBe(false);

		// Should still be retrievable via KeyvGenericStore
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set the key prefix", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		expect(keyv.getKeyPrefix("key1", "ns1")).toBe("ns1::key1");
		expect(keyv.getKeyPrefix("key1")).toBe("key1");
	});
});

describe("KeyvGenericStore with lru.min - Iterator", () => {
	test("should iterate over all entries", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(3);
		expect(entries.map(([key]) => key).sort()).toEqual([
			"key1",
			"key2",
			"key3",
		]);
	});

	test("should filter by namespace", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);

		// Set entries with different namespaces manually
		lru.set("ns1::key1", { value: "value1", expires: undefined });
		lru.set("ns1::key2", { value: "value2", expires: undefined });
		lru.set("ns2::key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should handle entries without expiration", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvGenericStore(lru);

		// Set valid entries only (no expiration)
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});
});

describe("KeyvGenericStore with lru.min - createKeyv() Integration", () => {
	test("should work with createKeyv helper", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = createKeyv(lru);

		await keyv.set("key1", "value1");
		const result = await keyv.get("key1");
		expect(result).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should respect LRU eviction with createKeyv", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = createKeyv(lru);

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		await keyv.set("key4", "value4");

		// key1 should be evicted (standard LRU)
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key4")).toStrictEqual({
			value: "value4",
			expires: undefined,
		});
	});

	test("should handle TTL with createKeyv", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = createKeyv(lru);

		await keyv.set("expiring", "value", 10);
		await sleep(20);
		expect(await keyv.get("expiring")).toBe(undefined);
	});
});

// ============================================================================
// Standard Map Tests
// ============================================================================

describe("KeyvGenericStore with Map - Store Options", () => {
	test("should accept Map as the store", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		expect(keyv.store).toBe(map);
	});

	test("should allow replacing the store", () => {
		const map1 = new Map<string, unknown>();
		const map2 = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map1);
		expect(keyv.store).toBe(map1);
		keyv.store = map2;
		expect(keyv.store).toBe(map2);
	});

	test("should set the namespace option with Map", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { namespace: "test" });
		expect(keyv.namespace).toBe("test");
	});

	test("should be able to set and get the keySeparator with Map", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { keySeparator: ":" });
		expect(keyv.keySeparator).toBe(":");
		keyv.keySeparator = "||";
		expect(keyv.keySeparator).toBe("||");
	});

	test("should be able to get the options", () => {
		const map = new Map<string, unknown>();
		const options = { namespace: "test", keySeparator: ":" };
		const keyv = new KeyvGenericStore(map, options);
		expect(keyv.opts).toEqual(options);
	});
});

describe("KeyvGenericStore with Map - Basic CRUD Operations", () => {
	test("should set and get a value", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set many keys", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		const result = await keyv.setMany([
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
		]);
		expect(await keyv.get("key1")).toStrictEqual({
			expires: undefined,
			value: "value1",
		});
		expect(await keyv.get("key2")).toStrictEqual({
			expires: undefined,
			value: "value2",
		});
		expect(result).toBeUndefined();
	});

	test("should get undefined for non-existent key", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		expect(await keyv.get("nonexistent")).toBe(undefined);
	});

	test("should handle get with TTL and expiration", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", { val: "value1" }, 10);
		await sleep(20);
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should handle has", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		expect(await keyv.has("key1")).toBe(true);
		expect(await keyv.has("key2")).toBe(false);
	});

	test("should be able to get many keys", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		const values = await keyv.getMany(["key1", "key2", "key3", "key4"]);
		expect(values[0]).toStrictEqual({ value: "value1", expires: undefined });
		expect(values[1]).toStrictEqual({ value: "value2", expires: undefined });
		expect(values[2]).toStrictEqual({ value: "value3", expires: undefined });
		expect(values[3]).toBe(undefined);
	});

	test("should store complex objects", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		const complexValue = {
			name: "test",
			nested: { a: 1, b: [1, 2, 3] },
			date: new Date("2024-01-01"),
		};
		await keyv.set("complex", complexValue);
		const result = await keyv.get("complex");
		expect(result).toStrictEqual({
			value: complexValue,
			expires: undefined,
		});
	});

	test("should track size correctly", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);

		expect(map.size).toBe(0);

		await keyv.set("key1", "value1");
		expect(map.size).toBe(1);

		await keyv.set("key2", "value2");
		expect(map.size).toBe(2);

		await keyv.delete("key1");
		expect(map.size).toBe(1);

		await keyv.clear();
		expect(map.size).toBe(0);
	});

	test("should not have size limits (unlike LRU)", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);

		// Add many entries - Map has no size limit
		for (let i = 0; i < 100; i++) {
			await keyv.set(`key${i}`, `value${i}`);
		}

		expect(map.size).toBe(100);

		// All entries should still exist
		expect(await keyv.get("key0")).toStrictEqual({
			value: "value0",
			expires: undefined,
		});
		expect(await keyv.get("key99")).toStrictEqual({
			value: "value99",
			expires: undefined,
		});
	});
});

describe("KeyvGenericStore with Map - Delete / Clear Operations", () => {
	test("should delete a key", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		await keyv.delete("key1");
		expect(await keyv.get("key1")).toBe(undefined);
	});

	test("should clear all keys", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.clear();
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(map.size).toBe(0);
	});

	test("should delete many keys", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.get("key3")).toStrictEqual({
			value: "value3",
			expires: undefined,
		});
	});

	test("should emit error on delete many keys failure", async () => {
		const map = new Map<string, unknown>();
		// Override delete to throw an error
		map.delete = () => {
			throw new Error("delete error");
		};

		const keyv = new KeyvGenericStore(map);
		let errorEmitted = false;
		keyv.on("error", (error) => {
			expect(error.message).toBe("delete error");
			errorEmitted = true;
		});
		await keyv.deleteMany(["key1", "key2"]);
		expect(errorEmitted).toBe(true);
	});
});

describe("KeyvGenericStore with Map - Namespace", () => {
	test("should store and retrieve with namespace", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { namespace: "myns" });

		await keyv.set("key1", "value1");

		// Verify the key is stored with namespace prefix
		expect(map.has("myns::key1")).toBe(true);
		expect(map.has("key1")).toBe(false);

		// Should still be retrievable via KeyvGenericStore
		expect(await keyv.get("key1")).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should return the namespace if it is a string", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { namespace: "test" });
		expect(keyv.getNamespace()).toBe("test");
	});

	test("should return the namespace if it is a function", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { namespace: () => "test" });
		expect(keyv.getNamespace()).toBe("test");
	});

	test("should set the key prefix", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		expect(keyv.getKeyPrefix("key1", "ns1")).toBe("ns1::key1");
		expect(keyv.getKeyPrefix("key1")).toBe("key1");
	});

	test("should get the key prefix data", () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		expect(keyv.getKeyPrefixData("ns1::key1")).toEqual({
			key: "key1",
			namespace: "ns1",
		});
		expect(keyv.getKeyPrefixData("key1")).toEqual({
			key: "key1",
			namespace: undefined,
		});
	});
});

describe("KeyvGenericStore with Map - Iterator", () => {
	test("should iterate over all entries", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");
		await keyv.set("key3", "value3");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(3);
		expect(entries.map(([key]) => key).sort()).toEqual([
			"key1",
			"key2",
			"key3",
		]);
	});

	test("should filter by namespace", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);

		// Set entries with different namespaces manually
		map.set("ns1::key1", { value: "value1", expires: undefined });
		map.set("ns1::key2", { value: "value2", expires: undefined });
		map.set("ns2::key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should skip expired entries and delete them", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map);

		// Set a valid entry
		await keyv.set("key1", "value1");

		// Set an expired entry manually
		map.set("key2", { value: "value2", expires: Date.now() - 1000 });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe("key1");

		// Verify expired entry was deleted
		expect(map.has("key2")).toBe(false);
	});

	test("should strip namespace prefix from keys when iterating with namespace", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { namespace: "myns" });

		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("myns")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		// Keys should not have namespace prefix
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});

	test("should work with custom key separator", async () => {
		const map = new Map<string, unknown>();
		const keyv = new KeyvGenericStore(map, { keySeparator: ":" });

		// Set entries with custom separator manually
		map.set("ns1:key1", { value: "value1", expires: undefined });
		map.set("ns1:key2", { value: "value2", expires: undefined });
		map.set("ns2:key3", { value: "value3", expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator("ns1")) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual(["key1", "key2"]);
	});
});

describe("KeyvGenericStore with Map - createKeyv() Integration", () => {
	test("should work with createKeyv helper", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		await keyv.set("key1", "value1");
		const result = await keyv.get("key1");
		expect(result).toStrictEqual({
			value: "value1",
			expires: undefined,
		});
	});

	test("should set many items and then get them", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		const testData = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
			{ key: "key3", value: "value3" },
		];

		await keyv.setMany(testData);
		const result = await keyv.getMany(testData.map((d) => d.key));
		expect(result.length).toBe(3);
	});

	test("should handle batch operations", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		const testData = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2" },
			{ key: "key3", value: "value3" },
			{ key: "key4", value: "value4" },
			{ key: "key5", value: "value5" },
		];

		await keyv.setMany(testData);
		const testKeys = testData.map((d) => d.key);

		// Get many
		const getResult = await keyv.getMany(testKeys);
		expect(getResult.length).toBe(5);

		// Has many
		const hasResult = await keyv.has(testKeys);
		expect(hasResult.length).toBe(5);
		expect(hasResult.every((r) => r === true)).toBe(true);

		// Delete many
		await keyv.deleteMany(["key1", "key2"]);
		expect(await keyv.get("key1")).toBe(undefined);
		expect(await keyv.get("key2")).toBe(undefined);
		expect(await keyv.has("key3")).toBe(true);
	});

	test("should handle TTL with createKeyv", async () => {
		const map = new Map<string, unknown>();
		const keyv = createKeyv(map);

		await keyv.set("expiring", "value", 10);
		await sleep(20);
		expect(await keyv.get("expiring")).toBe(undefined);
	});
});
