import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, { createKeyv, createKeyvNonBlocking } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("createKeyv", () => {
	test("should create Keyv instance with default options", async () => {
		const keyv = createKeyv(redisUri);
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
		expect(keyv.useKeyPrefix).toBe(false);
	});

	test("should create Keyv instance with custom namespace", async () => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv(redisUri, { namespace });
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		expect(keyv.useKeyPrefix).toBe(false);
	});

	test("should create Keyv instance with custom namespace and errors enabled", async () => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv(redisUri, {
			namespace,
			throwOnErrors: true,
			throwOnConnectError: true,
		});
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		expect(keyv.useKeyPrefix).toBe(false);
	});
});

describe("createKeyvNonBlocking", () => {
	test("should create Keyv instance with default options", async () => {
		const keyv = createKeyvNonBlocking(redisUri);
		expect(keyv).toBeDefined();
		expect(keyv.throwOnErrors).toBe(false);
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.store.throwOnErrors).toBe(false);
		expect(keyv.store.throwOnConnectError).toBe(false);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
		expect(keyv.useKeyPrefix).toBe(false);
	});

	test("should persist concurrent sets during the initial Redis connect", async () => {
		const keyv = createKeyvNonBlocking(redisUri);
		const errors: Error[] = [];
		const onError = (error: unknown) => {
			errors.push(error as Error);
		};
		keyv.on("error", onError);
		keyv.store.on("error", onError);

		const prefix = `keyv-concurrent-connect-${Date.now()}`;
		const keys = Array.from({ length: 50 }, (_, index) => `${prefix}:${index}`);
		const results = await Promise.all(
			keys.map((key, index) => keyv.set(key, index, 60_000)),
		);
		const values = await Promise.all(keys.map((key) => keyv.get<number>(key)));

		expect(results.every((result) => result === true)).toBe(true);
		expect(values).toEqual(keys.map((_, index) => index));
		expect(
			errors.filter((error) => error.name === "ClientOfflineError"),
		).toHaveLength(0);

		await keyv.deleteMany(keys);
		await keyv.disconnect();
	});

	test("should persist concurrent sets after disconnect and reconnect", async () => {
		const keyv = createKeyvNonBlocking(redisUri);
		const errors: Error[] = [];
		const onError = (error: unknown) => {
			errors.push(error as Error);
		};
		keyv.on("error", onError);
		keyv.store.on("error", onError);

		const warmupKey = `keyv-concurrent-reconnect-warmup-${Date.now()}`;
		await keyv.set(warmupKey, "warmup", 60_000);
		await keyv.disconnect();

		const prefix = `keyv-concurrent-reconnect-${Date.now()}`;
		const keys = Array.from({ length: 50 }, (_, index) => `${prefix}:${index}`);
		const results = await Promise.all(
			keys.map((key, index) => keyv.set(key, index, 60_000)),
		);
		const values = await Promise.all(keys.map((key) => keyv.get<number>(key)));

		expect(results.every((result) => result === true)).toBe(true);
		expect(values).toEqual(keys.map((_, index) => index));
		expect(
			errors.filter((error) => error.name === "ClientOfflineError"),
		).toHaveLength(0);

		await keyv.deleteMany(keys);
		await keyv.disconnect();
	});
});
