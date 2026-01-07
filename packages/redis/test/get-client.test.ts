import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, { createKeyv, RedisErrorMessages } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

describe("getClient", () => {
	test("should get client that is connected", async () => {
		const keyvRedis = new KeyvRedis(redisUri);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with default timeout", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 2000 });
		expect(keyvRedis.connectionTimeout).toBe(2000);
		keyvRedis.connectionTimeout = undefined; // Reset to default
		expect(keyvRedis.connectionTimeout).toBe(undefined);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should get client that is connected with timeout", async () => {
		const keyvRedis = new KeyvRedis(redisUri, { connectionTimeout: 2000 });
		expect(keyvRedis.connectionTimeout).toBe(2000);
		const client = await keyvRedis.getClient();
		expect(client).toBeDefined();
	});

	test("should throw an error if not connected", async () => {
		const keyvRedis = new KeyvRedis(redisBadUri, { connectionTimeout: 500 });
		keyvRedis.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await keyvRedis.getClient();
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Keyv", async () => {
		const keyv = createKeyv(redisBadUri, {
			throwOnErrors: true,
			connectionTimeout: 500,
		});
		keyv.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await keyv.get(faker.string.alphanumeric(10));
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});

	test("should throw an error if not connected with Keyv", async () => {
		const keyv = createKeyv(redisBadUri, {
			throwOnConnectError: true,
			connectionTimeout: 500,
		});
		keyv.on("error", () => {}); // Silence expected connection errors
		let didError = false;
		try {
			await keyv.get(faker.string.alphanumeric(10));
		} catch (error) {
			didError = true;
			expect((error as Error).message).toBe(
				RedisErrorMessages.RedisClientNotConnectedThrown,
			);
		}

		expect(didError).toBe(true);
	});
});
