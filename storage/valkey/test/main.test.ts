import process from "node:process";
import { faker } from "@faker-js/faker";
import Redis, { type Cluster } from "iovalkey";
import { describe, expect, test } from "vitest";
import KeyvValkey, { createKeyv } from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("KeyvValkey", () => {
	test("should be a class", () => {
		expect(KeyvValkey).toBeInstanceOf(Function);
	});

	test("should expose the client instance", () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(keyv.client).toBeInstanceOf(Redis);
	});

	test("should reuse an existing valkey instance", async () => {
		const redis = new Redis(valkeyUri);
		// @ts-expect-error foo doesn't exist on Redis
		redis.foo = "bar";
		const keyv = new KeyvValkey(redis);
		expect(keyv.client.foo).toBe("bar");

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
		await keyv.disconnect();
	});

	test("should handle options without a uri", () => {
		const options = { isCluster: true };
		const keyv = new KeyvValkey(options as Cluster);
		expect(keyv.client).toBeInstanceOf(Redis);
	});

	test("should handle options with a family option", () => {
		const options = { options: {}, family: 4 };
		const keyv = new KeyvValkey(options);
		expect(keyv.client).toBeInstanceOf(Redis);
	});

	test("should handle RedisOptions", () => {
		const options = { db: 2, connectionName: "name" };
		const keyv = new KeyvValkey(options);
		expect(keyv.client).toBeInstanceOf(Redis);
	});

	test("should apply useSets from options when passing in a client", () => {
		const redis = new Redis(valkeyUri);
		const keyv = new KeyvValkey(redis, { useSets: false });
		expect(keyv.useSets).toBe(false);
	});

	test("should default useSets to false", () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(keyv.useSets).toBe(false);
	});

	test("should get and set useSets via the setter", () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(keyv.useSets).toBe(false);
		keyv.useSets = true;
		expect(keyv.useSets).toBe(true);
	});

	test("should support the deprecated useRedisSets getter and setter", () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(keyv.useRedisSets).toBe(false);
		keyv.useRedisSets = true;
		expect(keyv.useRedisSets).toBe(true);
		expect(keyv.useSets).toBe(true);
	});

	test("should replace the client via the setter", () => {
		const keyv = new KeyvValkey(valkeyUri);
		const newClient = new Redis(valkeyUri);
		keyv.client = newClient;
		expect(keyv.client).toBe(newClient);
	});

	test("should close the connection on disconnect", async () => {
		const keyv = new KeyvValkey(valkeyUri);
		const key = faker.string.alphanumeric(10);
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
		await expect(keyv.get(key)).rejects.toThrow();
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
		const namespace = `ck-${faker.string.alphanumeric(8)}`;
		const keyv = createKeyv(valkeyUri, { namespace });
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);
		await keyv.disconnect();
	});

	test("should preserve the namespace from the connect options object", async () => {
		const namespace = `ck-obj-${faker.string.alphanumeric(8)}`;
		const keyv = createKeyv({ uri: valkeyUri, namespace });
		expect(keyv.namespace).toBe(namespace);
		expect(keyv.store.namespace).toBe(namespace);

		// Keys are stored under the namespace prefix natively, not un-namespaced.
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
