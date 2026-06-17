import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import { describe, expect, test, vi } from "vitest";
import KeyvRedis from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("set", () => {
	test("should set a value", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);
	});

	test("should throw on connection error with a bad uri", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, { connectionTimeout: 500 });
		keyvRedis.on("error", () => {}); // Silence expected connection errors

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		let didError = false;

		try {
			await keyvRedis.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should throw on set client error when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: false,
			throwOnErrors: true,
			connectionTimeout: 500,
		});
		keyvRedis.on("error", () => {}); // Silence expected connection errors

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Set the set value to throw an error on the client
		vi.spyOn(keyvRedis.client, "set").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
	});

	test("should set a value with ttl", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
			ttl: 100, // 100 milliseconds
		};

		await keyvRedis.set(data.key, data.value, data.ttl);

		const result = await keyvRedis.get(data.key);

		expect(result).toBe(data.value);

		await delay(300); // Wait for ttl to expire

		const expiredResult = await keyvRedis.get(data.key);
		expect(expiredResult).toBeUndefined();
	});

	test("should throw on redis client set error when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Mock the set method to throw an error
		vi.spyOn(keyvRedis.client, "set").mockImplementation(() => {
			throw new Error("Redis set error");
		});

		let didError = false;
		try {
			await keyvRedis.set(data.key, data.value);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "set").mockRestore();
	});

	test("should throw on redis client setMany error when throwOnErrors is true", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Mock the set method to throw an error
		vi.spyOn(keyvRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis setMany error");
		});

		let didError = false;
		try {
			await keyvRedis.setMany([data, data, data]);
		} catch {
			didError = true;
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "multi").mockRestore();
	});

	test("should return false entries on setMany error when throwOnErrors is false", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		keyvRedis.on("error", () => {}); // Silence expected errors

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		// Mock the multi method to throw an error
		vi.spyOn(keyvRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis setMany error");
		});

		const result = await keyvRedis.setMany([data, data, data]);
		expect(result).toEqual([false, false, false]);
		vi.spyOn(keyvRedis.client, "multi").mockRestore();
	});

	test("should be able to set a ttl", async () => {
		const keyvRedis = new KeyvRedis();
		const key = faker.string.uuid();
		await keyvRedis.set(key, faker.lorem.word(), 100);
		await delay(300);
		const value = await keyvRedis.get(key);
		expect(value).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test("should be able to set many keys", async () => {
		const keyvRedis = new KeyvRedis();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await keyvRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: faker.lorem.word(), ttl: 100 },
		]);
		const value = await keyvRedis.get(key1);
		expect(value).toBe(val1);
		const value2 = await keyvRedis.get(key2);
		expect(value2).toBe(val2);
		await delay(300);
		const value3 = await keyvRedis.get(key3);
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});
});
