import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("get", () => {
	test("should get a value that exists", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});

	test("should return undefined for a key that does not exist", async () => {
		const store = new KeyvValkey(valkeyUri);
		const result = await store.get(faker.string.alphanumeric(10));
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
		await store.disconnect();
	});

	test("should get many values", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);
		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
		]);
		const values = await store.getMany([key1, key2, key3]);
		expect(values).toEqual([val1, val2, val3]);
		await store.disconnect();
	});

	test("should return undefined for missing keys in getMany", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const missing = faker.string.alphanumeric(10);
		await store.set(key1, val1);
		const values = await store.getMany([key1, missing]);
		expect(values[0]).toBe(val1);
		expect(values[1]).toBeUndefined();
		expect(values[1]).not.toBeNull();
		await store.disconnect();
	});

	test("should return all undefined when no keys exist in getMany", async () => {
		const store = new KeyvValkey(valkeyUri);
		const values = await store.getMany([
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		]);
		expect(values).toEqual([undefined, undefined]);
		expect(values.every((value) => value !== null)).toBe(true);
		await store.disconnect();
	});

	test("should return an empty array for getMany with an empty input", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(await store.getMany([])).toEqual([]);
		await store.disconnect();
	});
});
