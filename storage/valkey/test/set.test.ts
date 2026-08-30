import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("set", () => {
	test("should set and return a stored value", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		expect(await store.set(key, value)).toBe(true);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});

	test("should return false when setting an undefined value", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		expect(await store.set(key, undefined)).toBe(false);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should expire a value after its expiry", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value, Date.now() + 100);
		expect(await store.get(key)).toBe(value);
		await delay(200);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should set a value when useSets is false", async () => {
		const store = new KeyvValkey(valkeyUri, { useSets: false });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});
});

describe("setMany", () => {
	test("should set multiple values", async () => {
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
		expect(await store.getMany([key1, key2, key3])).toEqual([val1, val2, val3]);
		await store.disconnect();
	});

	test("should expire values with an expiry", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.setMany([{ key, value, expires: Date.now() + 100 }]);
		expect(await store.get(key)).toBe(value);
		await delay(200);
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should not error on an empty array", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(await store.setMany([])).toEqual([]);
		await store.disconnect();
	});

	test("should skip undefined values", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: undefined },
		]);
		expect(await store.get(key1)).toBe(val1);
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});

	test("should not error when all values are undefined", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.setMany([
			{ key: key1, value: undefined },
			{ key: key2, value: undefined },
		]);
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});

	test("should return false entries when the transaction throws", async () => {
		const store = new KeyvValkey(valkeyUri);
		let emittedError = false;
		store.on("error", () => {
			emittedError = true;
		});
		// biome-ignore lint/complexity/useLiteralKeys: accessing private property to mock the client
		const client = store["_client"];
		const originalMulti = client.multi.bind(client);
		client.multi = () => {
			throw new Error(faker.lorem.sentence());
		};

		const result = await store.setMany([
			{ key: faker.string.alphanumeric(10), value: faker.string.alphanumeric(10) },
			{ key: faker.string.alphanumeric(10), value: faker.string.alphanumeric(10) },
		]);
		expect(result).toEqual([false, false]);
		expect(emittedError).toBe(true);

		client.multi = originalMulti;
		await store.disconnect();
	});
});
