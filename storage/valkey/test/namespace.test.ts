import process from "node:process";
import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import Redis from "iovalkey";
import Keyv from "keyv";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

describe("namespace", () => {
	test("should default the namespace to undefined", () => {
		const keyv = new KeyvValkey(valkeyUri);
		expect(keyv.namespace).toBeUndefined();
	});

	test("should get and set the namespace via the setter", () => {
		const keyv = new KeyvValkey(valkeyUri);
		keyv.namespace = "test-ns";
		expect(keyv.namespace).toBe("test-ns");
	});

	test("should apply the namespace option natively from the constructor", async () => {
		const namespace = `ctor-${faker.string.alphanumeric(8)}`;
		const keyv = new KeyvValkey(valkeyUri, { namespace });
		expect(keyv.namespace).toBe(namespace);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);

		// The key is stored natively under the namespace prefix.
		const client = new Redis(valkeyUri);
		expect(await client.get(`namespace:${namespace}:${key}`)).toBe(value);
		await client.disconnect();

		await keyv.clear();
		await keyv.disconnect();
	});

	test("should clear only the keys within the namespace", async () => {
		const namespace = faker.string.alphanumeric(8);
		const keyv = new Keyv(new KeyvValkey(valkeyUri), { namespace });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "value", 1);
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
		const keyv = new KeyvValkey(valkeyUri);
		expect(await keyv.clear()).toBeUndefined();
		await keyv.disconnect();
	});

	test("should clear keys when useSets is false", async () => {
		const keyv = new KeyvValkey(valkeyUri, { useSets: false });
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await keyv.set(key1, faker.string.alphanumeric(10));
		await keyv.set(key2, faker.string.alphanumeric(10));
		await keyv.clear();
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should not error when useSets is false and there are no keys", async () => {
		const keyv = new KeyvValkey(valkeyUri, { useSets: false });
		expect(await keyv.clear()).toBeUndefined();
		await keyv.disconnect();
	});

	test("should clear keys tracked in the set when useSets is true", async () => {
		const keyv = new KeyvValkey(valkeyUri, { useSets: true });
		keyv.namespace = `clear-sets-${faker.string.alphanumeric(8)}`;
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		await keyv.set(key1, faker.string.alphanumeric(10));
		await keyv.set(key2, faker.string.alphanumeric(10));
		await keyv.clear();
		expect(await keyv.get(key1)).toBe(undefined);
		expect(await keyv.get(key2)).toBe(undefined);
		await keyv.disconnect();
	});
});

describe("useSets", () => {
	test("should track keys via setMany when useSets is true", async () => {
		const keyv = new KeyvValkey(valkeyUri, { useSets: true });
		keyv.namespace = `setmany-${faker.string.alphanumeric(8)}`;
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		await keyv.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
		]);
		expect(await keyv.get(key1)).toBe(val1);
		expect(await keyv.get(key2)).toBe(val2);
		await keyv.clear();
		expect(await keyv.get(key1)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should use the sets: prefix for the tracking key", async () => {
		const client = new Redis(valkeyUri);
		const keyv = new KeyvValkey(client, { useSets: true });
		const namespace = `sets-prefix-${faker.string.alphanumeric(8)}`;
		keyv.namespace = namespace;
		await keyv.set(faker.string.alphanumeric(10), "value");

		expect(await client.exists(`sets:${namespace}`)).toBe(1);
		expect(await client.type(`sets:${namespace}`)).toBe("set");
		// The legacy namespace: format must not be used.
		expect(await client.exists(`namespace:${namespace}`)).toBe(0);

		await keyv.clear();
		await keyv.disconnect();
	});

	test("should use 'sets' as the prefix when no namespace is set", async () => {
		const client = new Redis(valkeyUri);
		const keyv = new KeyvValkey(client, { useSets: true });
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "value");

		expect(await client.exists("sets")).toBe(1);
		expect(await client.type("sets")).toBe("set");
		expect(await client.exists(`sets:${key}`)).toBe(1);
		expect(await keyv.get(key)).toBe("value");

		await keyv.clear();
		expect(await keyv.get(key)).toBe(undefined);
		await keyv.disconnect();
	});

	test("should clean up legacy namespace: tracking sets on clear", async () => {
		const client = new Redis(valkeyUri);
		const namespace = `legacy-${faker.string.alphanumeric(8)}`;

		// Simulate legacy data: a SET at namespace:<ns> tracking a data key.
		const legacyDataKey = `namespace:${namespace}:oldkey`;
		await client.set(legacyDataKey, "oldvalue");
		await client.sadd(`namespace:${namespace}`, legacyDataKey);

		const keyv = new KeyvValkey(client, { useSets: true });
		keyv.namespace = namespace;
		await keyv.clear();

		expect(await client.exists(`namespace:${namespace}`)).toBe(0);
		expect(await client.exists(legacyDataKey)).toBe(0);
		await keyv.disconnect();
	});

	test("should not collide with a string key at the namespace path", async () => {
		const client = new Redis(valkeyUri);
		const namespace = `collision-${faker.string.alphanumeric(8)}`;

		// Another client stores a string at namespace:<ns>.
		await client.set(`namespace:${namespace}`, "some-string-value");

		const keyv = new KeyvValkey(client, { useSets: true });
		keyv.namespace = namespace;
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "value");
		expect(await keyv.get(key)).toBe("value");
		await keyv.clear();
		expect(await keyv.get(key)).toBe(undefined);

		// Clean up the unmanaged string key.
		await client.del(`namespace:${namespace}`);
		await keyv.disconnect();
	});
});
