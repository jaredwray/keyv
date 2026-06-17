import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("set", () => {
	test("should set and return a stored value", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		expect(await keyv.set(key, value)).toBe(true);
		expect(await keyv.get(key)).toBe(value);
		await keyv.disconnect();
	});

	test("should return false when setting an undefined value", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		expect(await keyv.set(key, undefined)).toBe(false);
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should expire a value after its ttl", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value, 100);
		expect(await keyv.get(key)).toBe(value);
		await delay(200);
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should set a value when useSets is false", async () => {
		const keyv = new KeyvValkey(valkeyUri, { useSets: false });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
		await keyv.disconnect();
	});
});

describe("setMany", () => {
	test("should set multiple values", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);
		await keyv.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
		]);
		expect(await keyv.getMany([key1, key2, key3])).toEqual([val1, val2, val3]);
		await keyv.disconnect();
	});

	test("should expire values with a ttl", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.setMany([{ key, value, ttl: 100 }]);
		expect(await keyv.get(key)).toBe(value);
		await delay(200);
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should not error on an empty array", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(await keyv.setMany([])).toEqual([]);
		await keyv.disconnect();
	});

	test("should skip undefined values", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		await keyv.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: undefined },
		]);
		expect(await keyv.get(key1)).toBe(val1);
		expect(await keyv.get(key2)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should not error when all values are undefined", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await keyv.setMany([
			{ key: key1, value: undefined },
			{ key: key2, value: undefined },
		]);
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should return false entries when the transaction throws", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		let emittedError = false;
		keyv.on("error", () => {
			emittedError = true;
		});
		// biome-ignore lint/complexity/useLiteralKeys: accessing private property to mock the client
		const client = keyv["_client"];
		const originalMulti = client.multi.bind(client);
		client.multi = () => {
			throw new Error("multi failure");
		};

		const result = await keyv.setMany([
			{ key: faker.string.alphanumeric(10), value: "val1" },
			{ key: faker.string.alphanumeric(10), value: "val2" },
		]);
		expect(result).toEqual([false, false]);
		expect(emittedError).toBe(true);

		client.multi = originalMulti;
		await keyv.disconnect();
	});
});
