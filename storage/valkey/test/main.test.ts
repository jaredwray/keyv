import process from "node:process";
import { faker } from "@faker-js/faker";
import Redis, { type Cluster } from "iovalkey";
import { describe, expect, test } from "vitest";
import KeyvValkey, { createKeyv, KeyvValkey as NamedKeyvValkey } from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("KeyvValkey", () => {
	test("should be a class", () => {
		expect(KeyvValkey).toBeInstanceOf(Function);
	});

	test("should be available as a named export", () => {
		expect(NamedKeyvValkey).toBe(KeyvValkey);
	});

	test("should declare expires capability", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.capabilities.expires).toBe(true);
		await store.disconnect();
	});

	test("should expose the client instance", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.client).toBeInstanceOf(Redis);
		await store.disconnect();
	});

	test("should reuse an existing valkey instance", async () => {
		const redis = new Redis(valkeyUri);
		const marker = faker.string.alphanumeric(10);
		// @ts-expect-error foo doesn't exist on Redis
		redis.foo = marker;
		const store = new KeyvValkey(redis);
		expect(store.client.foo).toBe(marker);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.disconnect();
	});

	test("should handle options without a uri", async () => {
		const options = { isCluster: true };
		const store = new KeyvValkey(options as Cluster);
		expect(store.client).toBeInstanceOf(Redis);
		await store.disconnect();
	});

	test("should handle options with a family option", async () => {
		const options = { options: {}, family: 4 };
		const store = new KeyvValkey(options);
		expect(store.client).toBeInstanceOf(Redis);
		await store.disconnect();
	});

	test("should handle RedisOptions", async () => {
		const options = { db: 2, connectionName: faker.string.alphanumeric(8) };
		const store = new KeyvValkey(options);
		expect(store.client).toBeInstanceOf(Redis);
		await store.disconnect();
	});

	test("should apply useSets from options when passing in a client", async () => {
		const redis = new Redis(valkeyUri);
		const store = new KeyvValkey(redis, { useSets: false });
		expect(store.useSets).toBe(false);
		await store.disconnect();
	});

	test("should default useSets to false", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.useSets).toBe(false);
		await store.disconnect();
	});

	test("should get and set useSets via the setter", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.useSets).toBe(false);
		store.useSets = true;
		expect(store.useSets).toBe(true);
		await store.disconnect();
	});

	test("should support the deprecated useRedisSets getter and setter", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.useRedisSets).toBe(false);
		store.useRedisSets = true;
		expect(store.useRedisSets).toBe(true);
		expect(store.useSets).toBe(true);
		await store.disconnect();
	});

	test("should replace the client via the setter", async () => {
		const store = new KeyvValkey(valkeyUri);
		const previous = store.client;
		const newClient = new Redis(valkeyUri);
		store.client = newClient;
		expect(store.client).toBe(newClient);
		await previous.disconnect();
		await store.disconnect();
	});

	test("should close the connection on disconnect", async () => {
		const store = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		expect(await store.get(key)).toBe(undefined);
		await store.disconnect();
		await expect(store.get(key)).rejects.toThrow();
	});
});

describe("createKeyv", () => {
	test("should create a Keyv instance from a uri", async () => {
		const keyv = createKeyv(valkeyUri);
		expect(keyv).toBeTruthy();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
		await keyv.disconnect();
	});

	test("should create a Keyv instance with the default uri", async () => {
		const keyv = createKeyv();
		expect(keyv).toBeTruthy();
		await keyv.disconnect();
	});

	test("should propagate the namespace option to the store", async () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = createKeyv(valkeyUri, { namespace });
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		await keyv.disconnect();
	});

	test("should preserve the namespace from the connect options object", async () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = createKeyv({ uri: valkeyUri, namespace });
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		const client = new Redis(valkeyUri);
		expect(await client.exists(`namespace:${namespace}:${key}`)).toBe(1);
		expect(await client.exists(key)).toBe(0);
		await client.disconnect();

		await keyv.clear();
		await keyv.disconnect();
	});
});
