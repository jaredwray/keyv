import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370/1";

describe("delete", () => {
	test("should delete a value when useSets is false", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: false });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		await store.delete(key);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should delete a value and report success when useSets is true", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true });
		store.namespace = faker.string.alphanumeric(8);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		expect(await store.delete(key)).toBe(true);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should return false when deleting a key that does not exist", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true });
		store.namespace = faker.string.alphanumeric(8);
		expect(await store.delete(faker.string.alphanumeric(10))).toBe(false);
		await store.disconnect();
	});
});

describe("deleteMany", () => {
	test("should delete multiple keys", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));
		expect(await store.deleteMany([key1, key2])).toEqual([true, true]);
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});

	test("should return an empty array for an empty input", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(await store.deleteMany([])).toEqual([]);
		await store.disconnect();
	});

	test("should remove keys from the tracking set when useSets is true", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true, namespace });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));

		expect(await store.deleteMany([key1, key2, faker.string.alphanumeric(10)])).toEqual([
			true,
			true,
			false,
		]);
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		const client = await store.getClient();
		expect(await client.exists([`sets:${namespace}`])).toBe(0);
		await store.disconnect();
	});

	test("should reject when a command in the batch fails", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true, namespace });
		const client = await store.getClient();
		// A string at the tracking key makes the batch's SREM fail with WRONGTYPE.
		await client.set(`sets:${namespace}`, faker.string.alphanumeric(10));
		await expect(store.deleteMany([faker.string.alphanumeric(10)])).rejects.toThrow(/WRONGTYPE/);
		await client.del([`sets:${namespace}`]);
		await store.disconnect();
	});
});
