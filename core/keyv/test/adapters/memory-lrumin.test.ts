import { faker } from "@faker-js/faker";
import { createLRU } from "lru.min";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvMemoryAdapter } from "../../src/adapters/memory.js";
import { delay as sleep } from "../test-utils.js";

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
