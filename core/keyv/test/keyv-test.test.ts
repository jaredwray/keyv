import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Keyv } from "../src/index.js";

describe("Keyv", async () => {
	type TestData = {
		key: string;
		value: string;
	};

	let testData: TestData[] = [];

	let testKeys: string[] = [];

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}

		testKeys = testData.map((data) => data.key);

		vi.useFakeTimers();

		return () => {
			vi.useRealTimers();
		};
	});

	describe("constructor", async () => {
		test("should be able to create a new instance", async () => {
			const keyv = new Keyv();
			expect(keyv).toBeDefined();
		});

		test("should be able to create a new instance with a store", async () => {
			const keyv = new Keyv(new Map());
			expect(keyv).toBeDefined();
		});

		test("when setting store property with undefined it should default to Map", async () => {
			const store = undefined;
			const keyv = new Keyv({ store });
			expect(keyv.store).toBeInstanceOf(Map);
		});
	});

	describe("getMany", () => {
		test("the function exists", async () => {
			const keyv = new Keyv();
			expect(keyv.getMany).toBeDefined();
		});

		test("returns a promise that is empty if nothing is sent in", async () => {
			const keyv = new Keyv();
			const result = await keyv.getMany([]);
			expect(result.length).toEqual(0);
		});

		test("returns multiple values on in memory storage", async () => {
			const keyv = new Keyv();
			await keyv.setMany(testData);
			const result = await keyv.getMany(testKeys);
			expect(result.length).toEqual(testData.length);
			expect(result[0]).toEqual(testData[0].value);
		});

		test("does not call get when getMany is available", async () => {
			const map = new Map();
			const getManyMock = vi.fn((keys: string[]) =>
				keys.map((key) => map.get(key)),
			);
			const store = Object.assign(new Map(map), { getMany: getManyMock });
			const getSpy = vi.spyOn(store, "get");
			const keyv = new Keyv({ store, useKeyPrefix: false });

			await keyv.getMany(testKeys);
			expect(getManyMock).toHaveBeenCalled();
			expect(getSpy).not.toHaveBeenCalled();
		});

		test("handles expired values correctly", async () => {
			const deleteManyMock = vi.fn();
			const store = Object.assign(new Map(), {
				// biome-ignore lint/suspicious/noExplicitAny: test file
				getMany(this: Map<string, any>, keys: string[]) {
					return keys.map((key) => this.get(key));
				},
				deleteMany: deleteManyMock,
			});
			const deleteSpy = vi.spyOn(store, "delete");
			// UseKeyPrefix is false so it's easy to check the keys that deleteMany is called with
			const keyv = new Keyv({ store, useKeyPrefix: false });
			await keyv.setMany(
				testData.map((data) => ({
					key: data.key,
					value: data.value,
					ttl: 1000,
				})),
			);
			vi.advanceTimersByTime(1001);
			const result = await keyv.getMany(testKeys);
			expect(result.length).toEqual(testData.length);
			// It should return undefined for expired keys
			expect(result[0]).toBeUndefined();
			// It should call deleteMany with all the keys at once
			expect(deleteManyMock).toHaveBeenCalledWith(testKeys);
			// It should not call delete for each key individually
			expect(deleteSpy).not.toHaveBeenCalled();
		});
	});

	describe("setMany", async () => {
		test("the function exists", async () => {
			const keyv = new Keyv();
			expect(keyv.setMany).toBeDefined();
		});

		test("returns a promise that is empty if nothing is sent in", async () => {
			const keyv = new Keyv();
			const result = await keyv.setMany([]);
			expect(result.length).toEqual(0);
		});

		test("returns multiple responses on in memory storage", async () => {
			const keyv = new Keyv();
			const result = await keyv.setMany(testData);
			expect(result.length).toEqual(testData.length);
			const resultValue = await keyv.get(testData[0].key);
			expect(resultValue).toEqual(testData[0].value);
		});

		test("does not call set when setMany is available", async () => {
			const setManyMock = vi.fn((data: TestData[]) => data.map(() => true));
			const store = Object.assign(new Map(), { setMany: setManyMock });
			const setSpy = vi.spyOn(store, "set");
			const keyv = new Keyv(store);

			await keyv.setMany(testData);
			expect(setManyMock).toHaveBeenCalled();
			expect(setSpy).not.toHaveBeenCalled();
		});
	});

	describe("throwErrors", async () => {
		const throwingStore = new Map();
		throwingStore.get = () => {
			throw new Error("Test error");
		};

		throwingStore.set = () => {
			throw new Error("Test error");
		};

		throwingStore.delete = () => {
			throw new Error("Test error");
		};

		throwingStore.clear = () => {
			throw new Error("Test error");
		};

		throwingStore.has = () => {
			throw new Error("Test error");
		};

		test("should get the current throwOnErrors value", async () => {
			const keyv = new Keyv(throwingStore);
			expect(keyv.throwOnErrors).toBe(false);
		});

		test("should set the throwOnErrors value", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			expect(keyv.throwOnErrors).toBe(true);
		});

		test("should pass in the throwOnErrors option", async () => {
			const keyv = new Keyv({ store: throwingStore, throwOnErrors: true });
			expect(keyv.throwOnErrors).toBe(true);
		});

		test("should throw when setting a value", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.set("key", "value")).rejects.toThrow("Test error");
		});

		test("should not throw when setting a value with throwOnErrors set to false", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.set(
				faker.string.alphanumeric(10),
				faker.string.alphanumeric(10),
			);
			expect(result).toBe(false);
		});

		test("should throw when getting a value", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.get("key")).rejects.toThrow("Test error");
		});

		test("should not throw when getting a value with throwOnErrors set to false", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.get(faker.string.alphanumeric(10));
			expect(result).toBeUndefined();
		});

		test("should throw when deleting a value", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.delete("key")).rejects.toThrow("Test error");
		});

		test("should not throw when deleting a value with throwOnErrors set to false", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.delete(faker.string.alphanumeric(10));
			expect(result).toBe(false);
		});

		test("should throw when clearing the store", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.clear()).rejects.toThrow("Test error");
		});

		test("should not throw when clearing the store with throwOnErrors set to false", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.clear();
			expect(result).toBeUndefined();
		});

		test("should throw when checking if a key exists", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.has("key")).rejects.toThrow("Test error");
		});

		test("should not throw when checking if a key exists with throwOnErrors set to false", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = false;
			const result = await keyv.has(faker.string.alphanumeric(10));
			expect(result).toBe(false);
		});

		test("should throw when deleting multiple keys", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.deleteMany(testKeys)).rejects.toThrow("Test error");
		});

		test("should throw when setting multiple keys", async () => {
			const keyv = new Keyv(throwingStore);
			keyv.throwOnErrors = true;
			await expect(keyv.setMany(testData)).rejects.toThrow("Test error");
		});
	});

	describe("iterator", () => {
		test("should not increment 'deletes' stat indefinetly", async () => {
			const keyv = new Keyv({
				stats: true,
			});

			// Set an item that will expire in 100ms
			const result = await keyv.set("foo", "bar", 100);
			expect(result).toBe(true);
			expect(keyv.stats.deletes).toBe(0);

			// Now the item is expired
			vi.advanceTimersByTime(101);

			// No gets yet, so no deletes
			expect(keyv.stats.deletes).toBe(0);

			let iterationCount = 0;
			// Get all items using iterator
			for await (const _ of keyv.iterator?.(keyv) ?? []) {
				// All items are expired, it doesn't enter the loop
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(1);

			iterationCount = 0;
			// Get all items using iterator
			for await (const _ of keyv.iterator?.(keyv) ?? []) {
				// All items are expired, it doesn't enter the loop
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(1);
		});
	});
});
