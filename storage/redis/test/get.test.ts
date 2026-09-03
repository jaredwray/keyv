import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import { describe, expect, test, vi } from "vitest";
import KeyvRedis, { RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("get", () => {
	test("should get a value", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);

		const result = await keyvRedis.get(data.key);
		expect(result).toBe(data.value);
		await keyvRedis.disconnect();
	});

	test("should return undefined, not null, for a missing key", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const result = await keyvRedis.get(faker.string.alphanumeric(10));
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
		await keyvRedis.disconnect();
	});

	test("should get many values", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			value1: faker.lorem.sentence(),
			key2: faker.string.alphanumeric(10),
			value2: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key1, data.value1);
		await keyvRedis.set(data.key2, data.value2);

		const results = await keyvRedis.getMany([data.key1, data.key2]);
		expect(results).toEqual([data.value1, data.value2]);
		await keyvRedis.disconnect();
	});

	test("should return undefined, not null, for missing keys in getMany", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key1: faker.string.alphanumeric(10),
			key2: faker.string.alphanumeric(10),
		};

		const results = await keyvRedis.getMany([data.key1, data.key2]);
		expect(results).toEqual([undefined, undefined]);
		expect(results[0]).not.toBeNull();
		expect(results[1]).not.toBeNull();
		await keyvRedis.disconnect();
	});

	test("should return an empty array when getMany is called with no keys", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const results = await keyvRedis.getMany([]);
		expect(results).toEqual([]);
		await keyvRedis.disconnect();
	});

	test("should throw an error on client error when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "get").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.get(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "get").mockRestore();
	});

	test("should not throw an error on client error when throwOnErrors is false", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: false });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "get").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		let result: string | undefined = "";
		try {
			result = await keyvRedis.get(data.key);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toBeUndefined();
		expect(result).not.toBeNull();
		vi.spyOn(keyvRedis.client, "get").mockRestore();
	});

	test("should throw an error on getMany client error when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(keyvRedis.client, "mGet").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.getMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "mGet").mockRestore();
	});

	test("should not throw an error on getMany client error when throwOnErrors is false", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: false });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(keyvRedis.client, "mGet").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		let result: Array<string | undefined> = [];
		try {
			result = await keyvRedis.getMany(data.keys);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
		expect(result).toEqual([undefined, undefined]);
		expect(result[0]).not.toBeNull();
		vi.spyOn(keyvRedis.client, "mGet").mockRestore();
	});

	test("should get many keys including an expired entry", async () => {
		const keyvRedis = new KeyvRedis();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await keyvRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: faker.lorem.word(), expires: Date.now() + 100 },
		]);
		await delay(300);
		const values = await keyvRedis.getMany([key1, key2, key3]);
		expect(values).toEqual([val1, val2, undefined]);
		expect(values[2]).not.toBeNull();
		await keyvRedis.disconnect();
	});

	test("should throw on getMany connection error when throwOnConnectError is true", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {});

		let didError = false;
		try {
			await keyvRedis.getMany([faker.string.alphanumeric(10), faker.string.alphanumeric(10)]);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(RedisErrorMessages.RedisClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
	});

	test("should not throw on getMany connection error when throwOnConnectError is false", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: false,
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {});

		const result = await keyvRedis.getMany([
			faker.string.alphanumeric(10),
			faker.string.alphanumeric(10),
		]);
		expect(result).toEqual([undefined, undefined]);
		expect(result[0]).not.toBeNull();
	});
});
