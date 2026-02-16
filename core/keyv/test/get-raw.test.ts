import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import {
	type CompressionAdapter,
	Keyv,
	type KeyvStoreAdapter,
} from "../src/index.js";

const delay = async (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

// Mock compression adapter for testing compression code paths
const createMockCompression = (): CompressionAdapter => ({
	async compress(value: unknown) {
		return value;
	},
	async decompress(value: unknown) {
		return value;
	},
	serialize(data: Record<string, unknown>) {
		return JSON.stringify(data);
	},
	deserialize(data: string) {
		return JSON.parse(data);
	},
});

// In-memory store adapter with getMany support
const createStore = () => {
	const map = new Map<string, unknown>();
	const store = {
		opts: { dialect: "", url: "" },
		namespace: undefined as string | undefined,
		async get(key: string) {
			return map.get(key);
		},
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		async set(key: string, value: any, _ttl?: number) {
			map.set(key, value);
		},
		async delete(key: string) {
			return map.delete(key);
		},
		async clear() {
			map.clear();
		},
		async getMany(keys: string[]) {
			return keys.map((key) => map.get(key));
		},
		on() {
			return store;
		},
	} as unknown as KeyvStoreAdapter;
	return store;
};

describe("Keyv Get Raw", async () => {
	test("should return raw data", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value });
	});

	test("should return undefined for non-existing key", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const result = await keyv.getRaw(key);
		expect(result).toBeUndefined();
	});

	test("should return raw data with expiration", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value, 1000); // Set with 1 second expiration
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value, expires: expect.any(Number) });
	});

	test("should return undefined for expired key", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value, 50); // Set with 50ms expiration
		await delay(100); // Wait for expiration
		const result = await keyv.getRaw(key);
		expect(result).toBeUndefined();
	});

	test("should show a miss in stats for non-existing key", async () => {
		const keyv = new Keyv({ stats: true });
		const key = faker.string.alphanumeric(10);
		await keyv.getRaw(key);
		expect(keyv.stats.misses).toBe(1);
	});

	test("should show a hit in stats for existing key", async () => {
		const keyv = new Keyv({ stats: true });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		await keyv.getRaw(key);
		expect(keyv.stats.hits).toBe(1);
	});

	test("should be able to get raw data with compression", async () => {
		const keyv = new Keyv({ compression: createMockCompression() });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		const result = await keyv.getRaw<string>(key);
		expect(result).toEqual({ value });
	});
});

describe("Keyv Get Many Raw", async () => {
	test("should return many raw data", async () => {
		const keyv = new Keyv();
		const keys = Array.from({ length: 5 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(
			keys.map(async (key, index) => keyv.set(key, values[index])),
		);
		const results = await keyv.getManyRaw(keys);
		expect(results).toEqual(
			keys.map((_key, index) => ({ value: values[index] })),
		);
	});

	test("should return undefined for non-existing keys", async () => {
		const keyv = new Keyv();
		const keys = Array.from({ length: 5 }, () => faker.string.alphanumeric(10));
		const results = await keyv.getManyRaw(keys);
		expect(results).toEqual(
			Array.from({ length: keys.length }).fill(undefined),
		);
	});

	test("should return mixed results for existing and non-existing keys", async () => {
		const keyv = new Keyv();
		const existingKeys = Array.from({ length: 3 }, () =>
			faker.string.alphanumeric(10),
		);
		const nonExistingKeys = Array.from({ length: 2 }, () =>
			faker.string.alphanumeric(10),
		);
		const values = existingKeys.map(() => faker.string.alphanumeric(10));
		await Promise.all(
			existingKeys.map(async (key, index) => keyv.set(key, values[index])),
		);
		const results = await keyv.getManyRaw([
			...existingKeys,
			...nonExistingKeys,
		]);
		expect(results).toEqual([
			{ value: values[0] },
			{ value: values[1] },
			{ value: values[2] },
			undefined,
			undefined,
		]);
	});

	test("should return raw data with expiration for many keys", async () => {
		const keyv = new Keyv();
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(
			keys.map(async (key, index) => keyv.set(key, values[index], 1000)),
		); // Set with 1 second expiration
		const results = await keyv.getManyRaw(keys);
		expect(results).toEqual(
			keys.map((_key, index) => ({
				value: values[index],
				expires: expect.any(Number),
			})),
		);
	});

	test("should return undefined for expired keys in many raw data", async () => {
		const keyv = new Keyv();
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(
			keys.map(async (key, index) => keyv.set(key, values[index], 50)),
		); // Set with 50ms expiration
		await delay(100); // Wait for expiration
		const results = await keyv.getManyRaw(keys);
		expect(results).toEqual(
			Array.from({ length: keys.length }).fill(undefined),
		);
	});

	test("should get many with storage that supports getMany function", async () => {
		const keyv = new Keyv({ store: createStore() });
		const keys = Array.from({ length: 5 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		await Promise.all(
			keys.map(async (key, index) => keyv.set(key, values[index])),
		);
		const results = await keyv.getManyRaw(keys);
		expect(results).toEqual(
			keys.map((_key, index) => ({ value: values[index] })),
		);
	});

	test("sending in empty array should return empty array", async () => {
		const keyv = new Keyv();
		const results = await keyv.getManyRaw([]);
		expect(results).toEqual([]);
	});
});
