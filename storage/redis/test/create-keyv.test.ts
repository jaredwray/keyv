import process from "node:process";
import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import KeyvRedis, { createKeyv, createKeyvNonBlocking } from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";

describe("createKeyv", () => {
	test("should create a Keyv instance with default options", () => {
		const keyv = createKeyv(redisUri);
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
	});

	test("should default to the localhost Redis URI when connect is omitted", () => {
		const keyv = createKeyv();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBeUndefined();
	});

	test("should create a Keyv instance with a custom namespace", async () => {
		const namespace = faker.string.alphanumeric(10);
		const keyv = createKeyv(redisUri, { namespace });
		expect(keyv).toBeDefined();
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
	});

	test("should create a Keyv instance with a custom namespace and errors enabled", async () => {
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
		expect(keyv.throwOnErrors).toBe(true);
	});

	test("should create a cluster-backed Keyv instance from cluster options", () => {
		const keyv = createKeyv({
			rootNodes: [{ url: "redis://localhost:7001" }],
		});
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.store.isCluster()).toBe(true);
	});
});

describe("createKeyvNonBlocking", () => {
	test("should create a Keyv instance with default options", async () => {
		const keyv = createKeyvNonBlocking(redisUri);
		expect(keyv).toBeDefined();
		expect(keyv.throwOnErrors).toBe(false);
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.store.throwOnErrors).toBe(false);
		expect(keyv.store.throwOnConnectError).toBe(false);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
	});
});
