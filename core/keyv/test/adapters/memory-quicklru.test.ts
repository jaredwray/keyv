import { faker } from "@faker-js/faker";
import QuickLRU from "quick-lru";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvMemoryAdapter } from "../../src/adapters/memory.js";

describe("KeyvMemoryAdapter with QuickLRU - LRU Eviction Behavior", () => {
	/**
	 * Note: QuickLRU uses a double-buffer (hashlru) algorithm for performance.
	 * When the cache exceeds maxSize, it doesn't immediately evict the oldest item.
	 * Instead, it swaps buffers and items in the old buffer are only evicted when
	 * accessed (lazy eviction). Items accessed after buffer swap are promoted to
	 * the new buffer, but only up to maxSize items.
	 */

	test("should evict entries when cache exceeds capacity and entries are accessed", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
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

		// All three should exist
		expect(await keyv.get(key1)).toBe(value1);

		// Add a fourth entry - this triggers buffer swap
		await keyv.set(key4, value4);

		// key4 is in the new buffer
		expect(await keyv.get(key4)).toBe(value4);

		// key1 gets promoted to new buffer (now has: key4, key1)
		expect(await keyv.get(key1)).toBe(value1);

		// key2 gets promoted to new buffer (now has: key4, key1, key2 = maxSize)
		expect(await keyv.get(key2)).toBe(value2);

		// key3 cannot be promoted (new buffer at maxSize) - evicted
		expect(await keyv.get(key3)).toBe(undefined);
	});

	test("should track size correctly", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 10 });
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

	test("should evict all old buffer entries when new buffer fills up", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const key4 = faker.string.uuid();
		const key5 = faker.string.uuid();
		const key6 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		const value4 = faker.lorem.word();
		const value5 = faker.lorem.word();
		const value6 = faker.lorem.word();

		// Fill the cache
		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		// Add 3 more entries - these go to new buffer after swap
		await keyv.set(key4, value4);
		await keyv.set(key5, value5);
		await keyv.set(key6, value6);

		// key4, key5, key6 should be in the new buffer
		expect(await keyv.get(key4)).toBe(value4);
		expect(await keyv.get(key5)).toBe(value5);
		expect(await keyv.get(key6)).toBe(value6);

		// key1, key2, key3 are evicted (new buffer is full, can't promote)
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		expect(await keyv.get(key3)).toBe(undefined);
	});

	test("should update LRU order - accessed items get promoted", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
		const keyv = new KeyvMemoryAdapter(lru);

		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const key4 = faker.string.uuid();
		const key5 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		const value4 = faker.lorem.word();
		const value5 = faker.lorem.word();

		await keyv.set(key1, value1);
		await keyv.set(key2, value2);
		await keyv.set(key3, value3);

		// Access key1 first to make it recently used
		expect(await keyv.get(key1)).toBe(value1);

		// Add key4 - triggers buffer swap
		await keyv.set(key4, value4);

		// Access key1 again - it gets promoted to new buffer
		expect(await keyv.get(key1)).toBe(value1);

		// Add key5 - goes to new buffer (now: key4, key1, key5 = maxSize)
		await keyv.set(key5, value5);

		// key2 and key3 cannot be promoted - they're evicted
		expect(await keyv.get(key2)).toBe(undefined);
		expect(await keyv.get(key3)).toBe(undefined);

		// key1, key4, key5 should still be accessible
		expect(await keyv.get(key4)).toBe(value4);
		expect(await keyv.get(key5)).toBe(value5);
	});

	test("should handle updating existing keys without eviction", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 3 });
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
});

describe("KeyvMemoryAdapter with QuickLRU - createKeyv() Integration", () => {
	test("should work with createKeyv helper", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = createKeyv(lru);

		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyv.set(key, value);
		const result = await keyv.get(key);
		expect(result).toBe(value);
	});

	test("should handle batch operations", async () => {
		const lru = new QuickLRU<string, unknown>({ maxSize: 100 });
		const keyv = createKeyv(lru);

		const testData = [
			{ key: faker.string.uuid(), value: faker.lorem.word() },
			{ key: faker.string.uuid(), value: faker.lorem.word() },
			{ key: faker.string.uuid(), value: faker.lorem.word() },
			{ key: faker.string.uuid(), value: faker.lorem.word() },
			{ key: faker.string.uuid(), value: faker.lorem.word() },
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
		await keyv.deleteMany([testKeys[0], testKeys[1]]);
		expect(await keyv.get(testKeys[0])).toBe(undefined);
		expect(await keyv.get(testKeys[1])).toBe(undefined);
		expect(await keyv.has(testKeys[2])).toBe(true);
	});
});
