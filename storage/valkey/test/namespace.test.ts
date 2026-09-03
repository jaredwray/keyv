import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import Redis from "iovalkey";
import Keyv from "keyv";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("namespace", () => {
	test("should default the namespace to undefined", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(store.namespace).toBeUndefined();
		await store.disconnect();
	});

	test("should get and set the namespace via the setter", async () => {
		const store = new KeyvValkey(valkeyUri);
		const namespace = faker.string.alphanumeric(8);
		store.namespace = namespace;
		expect(store.namespace).toBe(namespace);
		await store.disconnect();
	});

	test("should apply the namespace option natively from the constructor", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkey(valkeyUri, { namespace });
		expect(store.namespace).toBe(namespace);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);

		const client = new Redis(valkeyUri);
		expect(await client.get(`namespace:${namespace}:${key}`)).toBe(value);
		await client.disconnect();

		await store.clear();
		await store.disconnect();
	});

	test("should clear only the keys within the namespace", async () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = new Keyv(new KeyvValkey(valkeyUri), { namespace });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value, 1);
		await delay(250);
		await keyv.clear();
		await keyv.disconnect();

		const client = new Redis(valkeyUri);
		expect(await client.exists(`namespace:${namespace}`)).toBe(0);
		await client.disconnect();
	});
});

describe("clear", () => {
	test("should not error when there are no keys to clear", async () => {
		const store = new KeyvValkey(valkeyUri);
		expect(await store.clear()).toBeUndefined();
		await store.disconnect();
	});

	test("should clear keys when useSets is false", async () => {
		const store = new KeyvValkey(valkeyUri, { useSets: false });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));
		await store.clear();
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});

	test("should not error when useSets is false and there are no keys", async () => {
		const store = new KeyvValkey(valkeyUri, { useSets: false });
		expect(await store.clear()).toBeUndefined();
		await store.disconnect();
	});

	test("should clear keys tracked in the set when useSets is true", async () => {
		const store = new KeyvValkey(valkeyUri, { useSets: true });
		store.namespace = faker.string.alphanumeric(8);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));
		await store.clear();
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});
});

describe("useSets", () => {
	test("should track keys via setMany when useSets is true", async () => {
		const store = new KeyvValkey(valkeyUri, { useSets: true });
		store.namespace = faker.string.alphanumeric(8);
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
		]);
		expect(await store.get(key1)).toBe(val1);
		expect(await store.get(key2)).toBe(val2);
		await store.clear();
		expect(await store.get(key1)).toBeUndefined();
		await store.disconnect();
	});

	test("should use the sets: prefix for the tracking key", async () => {
		const client = new Redis(valkeyUri);
		const store = new KeyvValkey(client, { useSets: true });
		const namespace = faker.string.alphanumeric(8);
		store.namespace = namespace;
		const value = faker.string.alphanumeric(10);
		await store.set(faker.string.alphanumeric(10), value);

		expect(await client.exists(`sets:${namespace}`)).toBe(1);
		expect(await client.type(`sets:${namespace}`)).toBe("set");
		expect(await client.exists(`namespace:${namespace}`)).toBe(0);

		await store.clear();
		await store.disconnect();
	});

	test("should use sets as the prefix when no namespace is set", async () => {
		const client = new Redis(valkeyUri);
		const store = new KeyvValkey(client, { useSets: true });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);

		expect(await client.exists("sets")).toBe(1);
		expect(await client.type("sets")).toBe("set");
		expect(await client.exists(`sets:${key}`)).toBe(1);
		expect(await store.get(key)).toBe(value);

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should clean up legacy namespace: tracking sets on clear", async () => {
		const client = new Redis(valkeyUri);
		const namespace = faker.string.alphanumeric(8);
		const legacyKey = faker.string.alphanumeric(10);
		const legacyValue = faker.string.alphanumeric(10);

		const legacyDataKey = `namespace:${namespace}:${legacyKey}`;
		await client.set(legacyDataKey, legacyValue);
		await client.sadd(`namespace:${namespace}`, legacyDataKey);

		const store = new KeyvValkey(client, { useSets: true });
		store.namespace = namespace;
		await store.clear();

		expect(await client.exists(`namespace:${namespace}`)).toBe(0);
		expect(await client.exists(legacyDataKey)).toBe(0);
		await store.disconnect();
	});

	test("should not collide with a string key at the namespace path", async () => {
		const client = new Redis(valkeyUri);
		const namespace = faker.string.alphanumeric(8);
		const unmanagedValue = faker.string.alphanumeric(10);

		await client.set(`namespace:${namespace}`, unmanagedValue);

		const store = new KeyvValkey(client, { useSets: true });
		store.namespace = namespace;
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.clear();
		expect(await store.get(key)).toBeUndefined();

		await client.del(`namespace:${namespace}`);
		await store.disconnect();
	});
});
