import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Keyv, KeyvMemoryAdapter, KeyvSanitize } from "../src/index.js";

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

		test("when setting store property with undefined it should default to KeyvMemoryAdapter", async () => {
			const store = undefined;
			const keyv = new Keyv({ store });
			expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);
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
			keyv.on("error", () => {});
			const result = await keyv.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
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
			keyv.on("error", () => {});
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
			keyv.on("error", () => {});
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
			keyv.on("error", () => {});
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
			keyv.on("error", () => {});
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
			for await (const _ of keyv.iterator() ?? []) {
				// All items are expired, it doesn't enter the loop
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(1);

			iterationCount = 0;
			// Get all items using iterator
			for await (const _ of keyv.iterator() ?? []) {
				// All items are expired, it doesn't enter the loop
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(1);
		});
	});

	describe("sanitize", () => {
		test("should not sanitize keys by default", async () => {
			const keyv = new Keyv();
			await keyv.set("test'; DROP TABLE", "value");
			expect(await keyv.get("test'; DROP TABLE")).toBe("value");
		});

		test("should sanitize keys when explicitly enabled", async () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			await keyv.set("test; DROP TABLE", "value");
			expect(await keyv.get("test DROP TABLE")).toBe("value");
		});

		test("should not sanitize keys when disabled", async () => {
			const keyv = new Keyv();
			await keyv.set("test'; DROP TABLE", "value");
			expect(await keyv.get("test'; DROP TABLE")).toBe("value");
		});

		test("should support granular category control on keys", async () => {
			const keyv = new Keyv({ sanitize: { keys: { sql: true, mongo: false } } });
			await keyv.set("$key;test", "value");
			expect(await keyv.get("$keytest")).toBe("value");
		});

		test("should sanitize keys in getMany", async () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			await keyv.set("clean-key", "value1");
			const result = await keyv.getMany(["clean-key", "miss;key"]);
			expect(result[0]).toBe("value1");
			expect(result[1]).toBeUndefined();
		});

		test("should sanitize keys in has", async () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			await keyv.set("test-key", "value");
			expect(await keyv.has("test-key")).toBe(true);
			expect(await keyv.has("test'-key")).toBe(false);
		});

		test("should sanitize keys in delete", async () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			await keyv.set("testkey", "value");
			await keyv.delete("test;key");
			expect(await keyv.has("testkey")).toBe(false);
		});

		test("should sanitize keys in setMany", async () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			await keyv.setMany([
				{ key: "key;1", value: "value1" },
				{ key: "key--2", value: "value2" },
			]);
			expect(await keyv.get("key1")).toBe("value1");
			expect(await keyv.get("key2")).toBe("value2");
		});

		test("getter and setter should work", () => {
			const keyv = new Keyv();
			expect(keyv.sanitize).toBeInstanceOf(KeyvSanitize);
			expect(keyv.sanitize.enabled).toBe(false);

			keyv.sanitize.updateOptions({ keys: true, namespace: true });
			expect(keyv.sanitize.enabled).toBe(true);

			keyv.sanitize.updateOptions({ keys: { sql: true, mongo: false } });
			expect(keyv.sanitize.keys.sql).toBe(true);
			expect(keyv.sanitize.keys.mongo).toBe(false);

			keyv.sanitize = new KeyvSanitize();
			expect(keyv.sanitize.enabled).toBe(false);
		});

		test("setter with updateOptions should enable all sanitization categories", async () => {
			const keyv = new Keyv();
			keyv.sanitize.updateOptions({ keys: true, namespace: true });
			await keyv.set("test;../key\0val", "value");
			expect(await keyv.get("testkeyval")).toBe("value");
		});

		test("setter with options object should apply granular sanitization", async () => {
			const keyv = new Keyv();
			keyv.sanitize.updateOptions({ keys: { sql: true, mongo: false, path: false } });
			await keyv.set("test;$key/../path", "value");
			expect(await keyv.get("test$key/../path")).toBe("value");
		});

		test("harmless characters pass through when sanitization is enabled", async () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			await keyv.set("user's-data", "value");
			expect(await keyv.get("user's-data")).toBe("value");
		});

		test("should sanitize namespace at construction", () => {
			const keyv = new Keyv({ namespace: "ns;evil", sanitize: { keys: true, namespace: true } });
			expect(keyv.namespace).toBe("nsevil");
		});

		test("should sanitize namespace on setter", () => {
			const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
			keyv.namespace = "ns;evil";
			expect(keyv.namespace).toBe("nsevil");
		});

		test("should not sanitize namespace when namespace is false", () => {
			const keyv = new Keyv({ namespace: "ns;evil", sanitize: { namespace: false } });
			expect(keyv.namespace).toBe("ns;evil");
		});

		test("should support independent patterns for keys and namespace", async () => {
			const keyv = new Keyv({
				namespace: "ns;../test",
				sanitize: {
					keys: { sql: true, path: false },
					namespace: { sql: false, path: true },
				},
			});
			// Namespace: path stripped, sql preserved
			expect(keyv.namespace).toBe("ns;test");
			// Keys: sql stripped, path preserved
			await keyv.set("key;../value", "data");
			expect(await keyv.get("key../value")).toBe("data");
		});
	});
});
