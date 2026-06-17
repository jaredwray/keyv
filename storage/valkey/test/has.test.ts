import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("has", () => {
	test("should return true for an existing key", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.string.alphanumeric(10));
		expect(await keyv.has(key)).toBe(true);
		await keyv.delete(key);
		await keyv.disconnect();
	});

	test("should return false for a key that does not exist", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(await keyv.has(faker.string.alphanumeric(10))).toBe(false);
		await keyv.disconnect();
	});

	test("should return false after a key is deleted", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.string.alphanumeric(10));
		expect(await keyv.has(key)).toBe(true);
		await keyv.delete(key);
		expect(await keyv.has(key)).toBe(false);
		await keyv.disconnect();
	});
});

describe("hasMany", () => {
	test("should return an array of booleans", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await keyv.set(key1, faker.string.alphanumeric(10));
		await keyv.set(key2, faker.string.alphanumeric(10));
		expect(await keyv.hasMany([key1, key2, key3])).toEqual([true, true, false]);
		await keyv.disconnect();
	});

	test("should return an empty array for an empty input", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(await keyv.hasMany([])).toEqual([]);
		await keyv.disconnect();
	});
});
