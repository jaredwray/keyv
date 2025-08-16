import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test, vi } from "vitest";
import KeyvRedis, { RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("delete", () => {
	test("should delete a value", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		await keyvRedis.set(data.key, data.value);
		await keyvRedis.delete(data.key);

		const result = await keyvRedis.get(data.key);

		expect(result).toBeUndefined();
	});

	test("should return false for non-existing keys", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const data = {
			key: faker.string.alphanumeric(10),
		};

		const result = await keyvRedis.delete(data.key);

		expect(result).toBe(false);
	});

	test("should throw on connection error", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, { throwOnConnectError: true });

		const data = {
			key: faker.string.alphanumeric(10),
			value: faker.lorem.sentence(),
		};

		let didError = false;
		try {
			await keyvRedis.delete(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should not throw on connection error when throwOnConnectError is false", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: false,
		});

		const data = {
			key: faker.string.alphanumeric(10),
		};

		let didError = false;
		try {
			await keyvRedis.delete(data.key);
		} catch {
			didError = true;
		}

		expect(didError).toBe(false);
	});

	test("should throw an error on client error", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "unlink").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.delete(data.key);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "unlink").mockRestore();
	});

	test("should throw on deleteMany client error", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, { throwOnConnectError: true });

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		let didError = false;
		try {
			await keyvRedis.deleteMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should not throw on deleteMany client error when throwOnConnectError is false", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, {
			throwOnConnectError: false,
		});

		const data = {
			keys: [faker.string.alphanumeric(10), faker.string.alphanumeric(10)],
		};

		let didError = false;
		try {
			await keyvRedis.deleteMany(data.keys);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(false);
	});

	test("should throw on getMany an error when throwOnErrors is true and an error occurs", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { throwOnErrors: true });

		const data = {
			key: faker.string.alphanumeric(10),
		};

		vi.spyOn(keyvRedis.client, "multi").mockImplementation(() => {
			throw new Error("Redis client error");
		});

		let didError = false;
		try {
			await keyvRedis.deleteMany([data.key]);
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe("Redis client error");
		}

		expect(didError).toBe(true);
		vi.spyOn(keyvRedis.client, "multi").mockRestore();
	});

	test("should return false on delete if key does not exist", async () => {
		const keyvRedis = new KeyvRedis();
		const deleted = await keyvRedis.delete("foo");
		expect(deleted).toBe(false);
		await keyvRedis.disconnect();
	});

	test("should be able to delete many with namespace", async () => {
		const keyvRedis = new KeyvRedis();
		await keyvRedis.setMany([
			{ key: "foo-dm1", value: "bar" },
			{ key: "foo-dm2", value: "bar2" },
			{ key: "foo-dm3", value: "bar3", ttl: 5 },
		]);
		await keyvRedis.deleteMany(["foo-dm2", "foo-dm3"]);
		const value = await keyvRedis.get("foo-dm1");
		expect(value).toBe("bar");
		const value2 = await keyvRedis.get("foo-dm2");
		expect(value2).toBeUndefined();
		const value3 = await keyvRedis.get("foo-dm3");
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test("should be able to delete many with namespace with useUnlink false", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.useUnlink = false;
		await keyvRedis.setMany([
			{ key: "foo-dm1", value: "bar" },
			{ key: "foo-dm2", value: "bar2" },
			{ key: "foo-dm3", value: "bar3", ttl: 5 },
		]);
		await keyvRedis.deleteMany(["foo-dm2", "foo-dm3"]);
		const value = await keyvRedis.get("foo-dm1");
		expect(value).toBe("bar");
		const value2 = await keyvRedis.get("foo-dm2");
		expect(value2).toBeUndefined();
		const value3 = await keyvRedis.get("foo-dm3");
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});
});
