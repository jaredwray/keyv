import { faker } from "@faker-js/faker";
import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Registers basic CRUD tests directly on the storage adapter: set/get round-trip,
 * get missing key, delete, has, and clear. Skipped if `options.basic` is `false`.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param store - Factory that returns a fresh {@link KeyvStorageAdapter} instance
 * @param options - Test configuration (missingValue, toggle flags)
 */
const storageBasicTests = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	/* v8 ignore next 3 -- @preserve */
	if (options?.basic === false) {
		return;
	}

	const missingValue = options?.missingValue;

	test("set(key, value) and get(key) round-trip", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await s.set(key, value);
		t.expect(await s.get(key)).toBe(value);
	});

	test("get(key) returns missingValue for nonexistent key", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		t.expect(await s.get(key)).toBe(missingValue);
	});

	test("delete(key) removes a key and returns true", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await s.set(key, value);
		t.expect(await s.delete(key)).toBe(true);
		t.expect(await s.get(key)).toBe(missingValue);
	});

	test("delete(key) returns false for nonexistent key", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		t.expect(await s.delete(key)).toBe(false);
	});

	test("has(key) returns true for existing key", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await s.set(key, value);
		t.expect(await s.has(key)).toBe(true);
	});

	test("has(key) returns false for nonexistent key", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		t.expect(await s.has(key)).toBe(false);
	});

	test("has(key) returns false after delete", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await s.set(key, value);
		t.expect(await s.has(key)).toBe(true);
		await s.delete(key);
		t.expect(await s.has(key)).toBe(false);
	});

	test("clear() removes all key/value pairs", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const value1 = faker.lorem.sentence();
		const value2 = faker.lorem.sentence();
		await s.set(key1, value1);
		await s.set(key2, value2);
		await s.clear();
		t.expect(await s.get(key1)).toBe(missingValue);
		t.expect(await s.get(key2)).toBe(missingValue);
	});
};

export { storageBasicTests };
