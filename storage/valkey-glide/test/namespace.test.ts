import process from "node:process";
import { faker } from "@faker-js/faker";
import { GlideClient } from "@valkey/valkey-glide";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("namespace", () => {
	test("should default the namespace to undefined", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(store.namespace).toBeUndefined();
		await store.disconnect();
	});

	test("should apply the namespace option natively from the constructor", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { namespace });
		expect(store.namespace).toBe(namespace);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);

		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		expect(await client.get(`namespace:${namespace}:${key}`)).toBe(value);
		client.close();

		await store.clear();
		await store.disconnect();
	});
});

describe("clear", () => {
	test("should not error when there are no keys to clear", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(await store.clear()).toBeUndefined();
		await store.disconnect();
	});

	test("should clear keys when useSets is false", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, {
			useSets: false,
			namespace: faker.string.alphanumeric(8),
		});
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));
		await store.clear();
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		await store.disconnect();
	});

	test("should clear keys tracked in the set when useSets is true", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true });
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
	test("should use the sets: prefix for the tracking key", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		const store = new KeyvValkeyGlide(client, { useSets: true });
		const namespace = faker.string.alphanumeric(8);
		store.namespace = namespace;
		await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));

		expect(await client.exists([`sets:${namespace}`])).toBe(1);
		expect(await client.type(`sets:${namespace}`)).toBe("set");
		expect(await client.exists([`namespace:${namespace}`])).toBe(0);

		await store.clear();
		await store.disconnect();
	});

	test("should clean up legacy namespace: tracking sets on clear", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
		});
		const namespace = faker.string.alphanumeric(8);
		const legacyKey = faker.string.alphanumeric(10);
		const legacyValue = faker.string.alphanumeric(10);
		const legacyDataKey = `namespace:${namespace}:${legacyKey}`;
		await client.set(legacyDataKey, legacyValue);
		await client.sadd(`namespace:${namespace}`, [legacyDataKey]);

		const store = new KeyvValkeyGlide(client, { useSets: true });
		store.namespace = namespace;
		await store.clear();

		expect(await client.exists([`namespace:${namespace}`])).toBe(0);
		expect(await client.exists([legacyDataKey])).toBe(0);
		await store.disconnect();
	});
});
