import process from "node:process";
import { faker } from "@faker-js/faker";
import type { RedisClientType } from "@redis/client";
import { describe, expect, test } from "vitest";
import KeyvRedis, {
	createClient,
	createCluster,
	createKeyv,
	createKeyvNonBlocking,
} from "../src/index.js";

const redisUri = process.env.REDIS_URI ?? "redis://localhost:6379";
const redisBadUri = process.env.REDIS_BAD_URI ?? "redis://localhost:6378";

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
		expect(keyv.store.throwOnErrors).toBe(true);
		expect(keyv.store.throwOnConnectError).toBe(true);
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
		expect(keyv.store).toBeInstanceOf(KeyvRedis);
		expect(keyv.store.throwOnErrors).toBe(false);
		expect(keyv.store.throwOnConnectError).toBe(false);
		expect(keyv.namespace).toBeUndefined();
		expect(keyv.store.namespace).toBeUndefined();
	});

	test("should return the fallback at once instead of reconnecting when Redis is down", async () => {
		const keyv = createKeyvNonBlocking(redisBadUri);
		const errors: unknown[] = [];
		keyv.on("error", (error: unknown) => errors.push(error));
		let reconnects = 0;
		keyv.store.on("reconnecting", () => {
			reconnects++;
		});

		const pending = Symbol("pending");
		let timer: ReturnType<typeof setTimeout> | undefined;
		const result = await Promise.race([
			keyv.get(faker.string.alphanumeric(10)),
			new Promise((resolve) => {
				timer = setTimeout(() => resolve(pending), 2000);
			}),
		]);
		clearTimeout(timer);

		expect(result).toBeUndefined();
		expect(errors.length).toBeGreaterThan(0);
		expect(reconnects).toBe(0);
		await keyv.store.disconnect(true);
	});

	test("should create the client with reconnect and the offline queue turned off", () => {
		const keyv = createKeyvNonBlocking(redisUri);
		const client = keyv.store.client as RedisClientType;
		expect(client.options?.socket?.reconnectStrategy).toBe(false);
		expect(client.options?.disableOfflineQueue).toBe(true);
	});

	test("should default to the localhost Redis URI when connect is omitted", () => {
		const keyv = createKeyvNonBlocking();
		const client = keyv.store.client as RedisClientType;
		expect(client.options?.url).toBe("redis://localhost:6379");
		expect(client.options?.socket?.reconnectStrategy).toBe(false);
	});

	test("should keep other client options without changing the caller's object", () => {
		const options = { url: redisUri, socket: { connectTimeout: 1234 } };
		const keyv = createKeyvNonBlocking(options);
		const client = keyv.store.client as RedisClientType;
		expect(client.options?.socket?.connectTimeout).toBe(1234);
		expect(client.options?.socket?.reconnectStrategy).toBe(false);
		expect(client.options?.disableOfflineQueue).toBe(true);
		expect(options).toEqual({ url: redisUri, socket: { connectTimeout: 1234 } });
	});

	test("should turn off the offline queue of a client passed in", () => {
		const client = createClient({ url: redisUri }) as RedisClientType;
		const keyv = createKeyvNonBlocking(client);
		expect(keyv.store.client).toBe(client);
		expect(client.options?.disableOfflineQueue).toBe(true);
	});

	test("should leave cluster and sentinel connections unchanged", () => {
		const rootNodes = [{ url: "redis://localhost:7001" }];
		const fromOptions = createKeyvNonBlocking({ rootNodes });
		expect(fromOptions.store.isCluster()).toBe(true);
		expect(fromOptions.store.throwOnErrors).toBe(false);

		const cluster = createCluster({ rootNodes });
		const fromCluster = createKeyvNonBlocking(cluster);
		expect(fromCluster.store.client).toBe(cluster);
		expect(fromCluster.store.throwOnConnectError).toBe(false);

		const sentinel = createKeyvNonBlocking({
			name: "mymaster",
			sentinelRootNodes: [{ host: "127.0.0.1", port: 26379 }],
		});
		expect(sentinel.store.throwOnErrors).toBe(false);
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
		const results = await Promise.all(keys.map((key, index) => keyv.set(key, index, 60_000)));
		const values = await Promise.all(keys.map((key) => keyv.get<number>(key)));

		expect(results.every((result) => result === true)).toBe(true);
		expect(values).toEqual(keys.map((_, index) => index));
		expect(errors.filter((error) => error.name === "ClientOfflineError")).toHaveLength(0);

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
		const results = await Promise.all(keys.map((key, index) => keyv.set(key, index, 60_000)));
		const values = await Promise.all(keys.map((key) => keyv.get<number>(key)));

		expect(results.every((result) => result === true)).toBe(true);
		expect(values).toEqual(keys.map((_, index) => index));
		expect(errors.filter((error) => error.name === "ClientOfflineError")).toHaveLength(0);

		await keyv.deleteMany(keys);
		await keyv.disconnect();
	});
});
