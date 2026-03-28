import { faker } from "@faker-js/faker";
import { createLRU } from "lru.min";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvMemoryAdapter } from "../../src/adapters/memory.js";

// eslint-disable-next-line no-promise-executor-return
const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("KeyvMemoryAdapter with lru.min - Store Options", () => {
	test("should accept lru.min as the store", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		expect(keyv.store).toBe(lru);
	});

	test("should set the namespace option with lru.min", () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const namespace = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(lru, { namespace });
		expect(keyv.namespace).toBe(namespace);
	});
});

describe("KeyvMemoryAdapter with lru.min - LRU Eviction Behavior", () => {
	test("should evict oldest entry when max is exceeded", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const key4 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		const value4 = faker.lorem.word();

		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		// Add a fourth entry - should evict key1 (oldest, not accessed)
		await keyv.set(key4, value4);

		// key1 should be evicted (lru.min uses standard LRU eviction)
		expect(await keyv.get(key1)).toBe(undefined);

		// key2, key3, key4 should still exist
		expect(await keyv.get(key2)).toBe(value2);
		expect(await keyv.get(key3)).toBe(value3);
		expect(await keyv.get(key4)).toBe(value4);
	});

	test("should track size correctly", async () => {
		const lru = createLRU<string, unknown>({ max: 10 });
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();

		expect(lru.size).toBe(0);

		await keyv.set(key1, value1);
		expect(lru.size).toBe(1);

		await keyv.set(key2, value2);
		expect(lru.size).toBe(2);

		await keyv.delete(key1);
		expect(lru.size).toBe(1);

		await keyv.clear();
		expect(lru.size).toBe(0);
	});

	test("should update LRU order on get (most recently accessed stays)", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const key4 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		const value4 = faker.lorem.word();

		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		// Access key1 to make it most recently used
		await keyv.get(key1);

		// Add a new entry - key2 should be evicted (now oldest)
		await keyv.set(key4, value4);

		// key2 should be evicted
		expect(await keyv.get(key2)).toBe(undefined);

		// key1, key3, key4 should still exist
		expect(await keyv.get(key1)).toBe(value1);
		expect(await keyv.get(key3)).toBe(value3);
		expect(await keyv.get(key4)).toBe(value4);
	});

	test("should handle updating existing keys without eviction", async () => {
		const lru = createLRU<string, unknown>({ max: 3 });
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		const updatedValue1 = faker.lorem.word();

		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		// Update existing key - should not cause eviction
		await keyv.set(key1, updatedValue1);

		expect(lru.size).toBe(3);
		expect(await keyv.get(key1)).toBe(updatedValue1);
		expect(await keyv.get(key2)).toBe(value2);
		expect(await keyv.get(key3)).toBe(value3);
	});

	test("should support onEviction callback", async () => {
		const evictedItems: Array<{ key: string; value: unknown }> = [];
		const lru = createLRU<string, unknown>({
			max: 2,
			onEviction: (key, value) => {
				evictedItems.push({ key, value });
			},
		});
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();

		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3); // This should evict key1

		expect(evictedItems.length).toBe(1);
		expect(evictedItems[0].key).toBe(key1);
	});
});

describe("KeyvMemoryAdapter with lru.min - Basic CRUD Operations", () => {
	test("should set and get a value", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("should set many keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const result = await keyv.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
		]);
		expect(await keyv.get(key1)).toBe(value1);
		expect(await keyv.get(key2)).toBe(value2);
		expect(result).toEqual([true, true]);
	});

	test("should get undefined for non-existent key", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key = faker.string.uuid();
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should handle get with TTL and expiration", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, { value, expires: Date.now() + 10 }, 10);
		await sleep(20);
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should handle has", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key1, value);
		expect(await keyv.has(key1)).toBe(true);
		expect(await keyv.has(key2)).toBe(false);
	});
});

describe("KeyvMemoryAdapter with lru.min - Delete / Clear Operations", () => {
	test("should delete a key", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, value);
		await keyv.delete(key);
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should clear all keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.clear();
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		expect(lru.size).toBe(0);
	});

	test("should delete many keys", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);
		await keyv.deleteMany([key1, key2]);
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		expect(await keyv.get(key3)).toBe(value3);
	});
});

describe("KeyvMemoryAdapter with lru.min - Namespace", () => {
	test("should store and retrieve with namespace", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const namespace = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(lru, { namespace });
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyv.set(key, value);

		// Verify the key is stored with namespace prefix
		expect(lru.has(`${namespace}:${key}`)).toBe(true);
		expect(lru.has(key)).toBe(false);

		// Should still be retrievable via KeyvMemoryAdapter
		expect(await keyv.get(key)).toBe(value);
	});
});

describe("KeyvMemoryAdapter with lru.min - Iterator", () => {
	test("should iterate over all entries", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = new KeyvMemoryAdapter(lru);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(3);
		expect(entries.map(([key]) => key).sort()).toEqual([key1, key2, key3].sort());
	});

	test("should filter by namespace", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(lru, { namespace: ns1 });

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();

		// Set entries with different namespaces manually
		lru.set(`${ns1}:${key1}`, { value: value1, expires: undefined });
		lru.set(`${ns1}:${key2}`, { value: value2, expires: undefined });
		lru.set(`${ns2}:${key3}`, { value: value3, expires: undefined });

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
		expect(entries.map(([key]) => key).sort()).toEqual([key1, key2].sort());
	});
});

describe("KeyvMemoryAdapter with lru.min - createKeyv() Integration", () => {
	test("should work with createKeyv helper", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = createKeyv(lru);

		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyv.set(key, value);
		const result = await keyv.get(key);
		expect(result).toBe(value);
	});

	test("should handle TTL with createKeyv", async () => {
		const lru = createLRU<string, unknown>({ max: 100 });
		const keyv = createKeyv(lru);

		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyv.set(key, value, 10);
		await sleep(20);
		expect(await keyv.get(key)).toBe(undefined);
	});
});
