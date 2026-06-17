import process from "node:process";
import { faker } from "@faker-js/faker";
import Redis from "iovalkey";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("delete", () => {
	test("should delete a value when useSets is false", async () => {
		const keyv = new KeyvValkey(new Redis(valkeyUri), { useSets: false });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		await keyv.delete(key);
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should delete a value and report success when useSets is true", async () => {
		const keyv = new KeyvValkey(new Redis(valkeyUri), { useSets: true });
		keyv.namespace = `del-sets-${faker.string.alphanumeric(8)}`;
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);

		expect(await keyv.delete(key)).toBe(true);
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should return false when deleting a key that does not exist", async () => {
		const keyv = new KeyvValkey(new Redis(valkeyUri), { useSets: true });
		keyv.namespace = `del-missing-${faker.string.alphanumeric(8)}`;
		expect(await keyv.delete(faker.string.alphanumeric(10))).toBe(false);
		await keyv.disconnect();
	});
});

describe("deleteMany", () => {
	test("should batch delete keys", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		expect(await keyv.deleteMany([key1, key2])).toEqual([true, true]);
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should return false for keys that do not exist", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		expect(await keyv.deleteMany([key1, key2])).toEqual([false, false]);
		await keyv.disconnect();
	});

	test("should return an empty array for an empty input", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(await keyv.deleteMany([])).toEqual([]);
		await keyv.disconnect();
	});

	test("should remove keys from the tracking set when useSets is true", async () => {
		const keyv = new KeyvValkey(valkeyUri, { useSets: true });
		keyv.namespace = `delmany-${faker.string.alphanumeric(8)}`;
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.deleteMany([key1, key2]);
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		await keyv.disconnect();
	});
});
