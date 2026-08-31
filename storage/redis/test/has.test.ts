import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import { describe, expect, test, vi } from "vitest";
import KeyvRedis, { RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("has", () => {
	test("should return true for an existing key", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();

		await keyvRedis.set(key, value);

		expect(await keyvRedis.has(key)).toBe(true);
		await keyvRedis.disconnect();
	});

	test("should return false for a missing key", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const key = faker.string.alphanumeric(10);

		expect(await keyvRedis.has(key)).toBe(false);
		await keyvRedis.disconnect();
	});

	test("should throw on connection error", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {}); // Silence expected connection errors

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "exists").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(RedisErrorMessages.RedisClientNotConnectedThrown);
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "exists").mockRestore();
	});

	test("should not throw on connection error when throwOnConnectError is false", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: false,
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {}); // Silence expected connection errors

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "exists").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(false);
		vi.spyOn(keyvRedis.client, "exists").mockRestore();
	});

	test("should throw on has when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "exists").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.has(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "exists").mockRestore();
	});

	test("should not throw on hasMany when throwOnErrors is false", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: false });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(keyvRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(false);
		vi.spyOn(keyvRedis.client, "multi").mockRestore();
	});

	test("should throw on hasMany when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		vi.spyOn(keyvRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.hasMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "multi").mockRestore();
	});

	test("should return existence flags for many keys including an expired entry", async () => {
		const keyvRedis = new KeyvRedis();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const value2 = faker.lorem.word();
		const value3 = faker.lorem.word();
		await keyvRedis.setMany([
			{ key: key1, value: value1 },
			{ key: key2, value: value2 },
			{ key: key3, value: value3, expires: Date.now() + 100 },
		]);
		await delay(300);
		const exists = await keyvRedis.hasMany([key1, key2, key3]);
		expect(exists).toEqual([true, true, false]);
		await keyvRedis.disconnect();
	});
});
