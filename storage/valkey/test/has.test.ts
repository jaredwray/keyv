import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("has", () => {
	test("should return true for an existing key", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		await store.set(key, faker.string.alphanumeric(10));
		expect(await store.has(key)).toBe(true);
		await store.delete(key);
		await store.disconnect();
	});

	test("should return false for a key that does not exist", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(await store.has(faker.string.alphanumeric(10))).toBe(false);
		await store.disconnect();
	});

	test("should return false after a key is deleted", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		await store.set(key, faker.string.alphanumeric(10));
		expect(await store.has(key)).toBe(true);
		await store.delete(key);
		expect(await store.has(key)).toBe(false);
		await store.disconnect();
	});
});

describe("hasMany", () => {
	test("should return an array of booleans", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));
		expect(await store.hasMany([key1, key2, key3])).toEqual([true, true, false]);
		await store.disconnect();
	});

	test("should return an empty array for an empty input", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(await store.hasMany([])).toEqual([]);
		await store.disconnect();
	});
});
