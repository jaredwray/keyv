import { faker } from "@faker-js/faker";
import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

const storageBatchTests = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	const missingValue = options?.missingValue;

	test("setMany stores multiple keys", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await s.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
		]);
		t.expect(await s.get(key1)).toBe(val1);
		t.expect(await s.get(key2)).toBe(val2);
		t.expect(await s.get(key3)).toBe(val3);
	});

	test("setMany with empty array does not error", async (t) => {
		const s = store();
		const result = await s.setMany([]);
		/* v8 ignore next -- @preserve */
		t.expect(Array.isArray(result) || result === undefined).toBe(true);
	});

	test("getMany returns correct values", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await s.set(key1, val1);
		await s.set(key2, val2);
		const results = await s.getMany([key1, key2]);
		t.expect(results).toEqual([val1, val2]);
	});

	test("getMany returns missingValue for nonexistent keys", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const results = await s.getMany([key1, key2]);
		t.expect(results).toEqual([missingValue, missingValue]);
	});

	test("getMany with empty array returns empty array", async (t) => {
		const s = store();
		const results = await s.getMany([]);
		t.expect(results).toEqual([]);
	});

	test("hasMany returns array of booleans", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await s.set(key1, faker.lorem.word());
		await s.set(key2, faker.lorem.word());
		const results = await s.hasMany([key1, key2, key3]);
		t.expect(results).toEqual([true, true, false]);
	});

	test("hasMany with empty array returns empty array", async (t) => {
		const s = store();
		const results = await s.hasMany([]);
		t.expect(results).toEqual([]);
	});

	test("deleteMany removes keys and returns true", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await s.set(key1, val1);
		await s.set(key2, val2);
		const result = await s.deleteMany([key1, key2]);
		t.expect(result).toEqual([true, true]);
		t.expect(await s.get(key1)).toBe(missingValue);
		t.expect(await s.get(key2)).toBe(missingValue);
	});

	test("deleteMany with nonexistent keys returns array of false", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const result = await s.deleteMany([key1, key2]);
		t.expect(result).toEqual([false, false]);
	});

	test("deleteMany with empty array returns empty array", async (t) => {
		const s = store();
		const result = await s.deleteMany([]);
		t.expect(result).toEqual([]);
	});
};

export default storageBatchTests;
