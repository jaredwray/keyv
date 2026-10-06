import process from "node:process";
import { faker } from "@faker-js/faker";
import { GlideClient } from "@valkey/valkey-glide";
import Keyv from "keyv";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370/1";

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
			databaseId: 1,
		});
		expect(await client.get(`namespace:${namespace}::${key}`)).toBe(value);
		client.close();

		await store.clear();
		await store.disconnect();
	});

	test("should default the namespace separator to ::", async () => {
		const store = new KeyvValkeyGlide(valkeyUri);
		expect(store.namespaceSeparator).toBe("::");
		store.namespaceSeparator = ":";
		expect(store.namespaceSeparator).toBe(":");
		await store.disconnect();
	});

	test("should apply namespaceSeparator when passing in a client", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		const store = new KeyvValkeyGlide(client, { namespaceSeparator: "|" });
		expect(store.namespaceSeparator).toBe("|");
		await store.disconnect();
	});

	test("should use a custom namespaceSeparator in keys, iterator and clear", async () => {
		const namespace = faker.string.alphanumeric(8);
		// `*` is a glob metacharacter, so the SCAN pattern has to match it literally.
		const store = new KeyvValkeyGlide(valkeyUri, { namespace, namespaceSeparator: "*" });
		const sibling = new KeyvValkeyGlide(valkeyUri, { namespace: `${namespace}x` });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		const siblingKey = faker.string.alphanumeric(10);
		await store.set(key, value);
		await sibling.set(siblingKey, faker.string.alphanumeric(10));

		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		expect(await client.get(`namespace:${namespace}*${key}`)).toBe(value);
		const collected = new Map<string, unknown>();
		for await (const [collectedKey, collectedValue] of store.iterator()) {
			collected.set(collectedKey, collectedValue);
		}

		expect([...collected]).toEqual([[key, value]]);

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		expect(await sibling.has(siblingKey)).toBe(true);

		client.close();
		await sibling.clear();
		await sibling.disconnect();
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

	test("should track keys under the bare 'sets' key when useSets is true and no namespace is set", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true });
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);

		expect(await client.exists([`sets::${key}`])).toBe(1);
		expect(await client.sismember("sets", `sets::${key}`)).toBe(true);

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		client.close();
		await store.disconnect();
	});

	test("should clear a namespace that spans several SCAN pages", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { namespace: faker.string.alphanumeric(8) });
		// SCAN returns about 10 keys per call, so 60 keys take several pages.
		const keys = Array.from({ length: 60 }, () => faker.string.alphanumeric(12));
		await store.setMany(keys.map((key) => ({ key, value: faker.string.alphanumeric(10) })));
		await store.clear();
		expect(await store.hasMany(keys)).toEqual(keys.map(() => false));
		await store.disconnect();
	});

	test("should not clear keys from a namespace that shares a prefix with another namespace", async () => {
		const base = faker.string.alphanumeric(8);
		const namespaceA = base;
		const namespaceB = `${base}bar`;

		const storeA = new KeyvValkeyGlide(valkeyUri, { namespace: namespaceA });
		const storeB = new KeyvValkeyGlide(valkeyUri, { namespace: namespaceB });

		const keyA = faker.string.alphanumeric(10);
		const keyB = faker.string.alphanumeric(10);
		await storeA.set(keyA, faker.string.alphanumeric(10));
		await storeB.set(keyB, faker.string.alphanumeric(10));

		await storeA.clear();

		expect(await storeA.get(keyA)).toBeUndefined();
		expect(await storeB.get(keyB)).not.toBeUndefined();

		await storeB.clear();
		await storeA.disconnect();
		await storeB.disconnect();
	});

	test("should not clear another namespace when this namespace contains glob metacharacters", async () => {
		const base = faker.string.alphanumeric(6);
		const namespaceA = `${base}*`;
		const namespaceB = `${base}X`;

		const storeA = new KeyvValkeyGlide(valkeyUri, { namespace: namespaceA });
		const storeB = new KeyvValkeyGlide(valkeyUri, { namespace: namespaceB });

		const keyA = faker.string.alphanumeric(10);
		const keyB = faker.string.alphanumeric(10);
		await storeA.set(keyA, faker.string.alphanumeric(10));
		await storeB.set(keyB, faker.string.alphanumeric(10));

		await storeA.clear();

		expect(await storeA.get(keyA)).toBeUndefined();
		expect(await storeB.get(keyB)).not.toBeUndefined();

		await storeB.clear();
		await storeA.disconnect();
		await storeB.disconnect();
	});

	test("should match every glob metacharacter in the namespace literally", async () => {
		const base = faker.string.alphanumeric(8);
		// `[a-z]`, `?`, `*` and a trailing backslash would all be glob syntax if left unescaped.
		const store = new KeyvValkeyGlide(valkeyUri, { namespace: `${base}[a-z]?*\\` });
		const sibling = new KeyvValkeyGlide(valkeyUri, { namespace: `${base}xy-prod` });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		await sibling.set(key, value);

		await store.clear();

		expect(await store.get(key)).toBeUndefined();
		expect(await sibling.get(key)).toBe(value);

		await sibling.clear();
		await store.disconnect();
		await sibling.disconnect();
	});

	test("should not clear a namespace that shares a prefix when useSets is true", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true, namespace });
		const sibling = new KeyvValkeyGlide(valkeyUri, {
			useSets: true,
			namespace: `${namespace}${faker.string.alphanumeric(3)}`,
		});
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		await sibling.set(key, value);

		await store.clear();

		expect(await store.get(key)).toBeUndefined();
		expect(await sibling.get(key)).toBe(value);

		await sibling.clear();
		await store.disconnect();
		await sibling.disconnect();
	});

	test("should clear only the Keyv instance's namespace", async () => {
		const keyv = new Keyv({
			store: new KeyvValkeyGlide(valkeyUri),
			namespace: faker.string.alphanumeric(8),
		});
		const other = new Keyv({
			store: new KeyvValkeyGlide(valkeyUri),
			namespace: faker.string.alphanumeric(8),
		});
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, faker.string.alphanumeric(10));
		await other.set(key, "other");

		await keyv.clear();

		expect(await keyv.get(key)).toBeUndefined();
		expect(await other.get(key)).toBe("other");
		await other.clear();
		await keyv.disconnect();
		await other.disconnect();
	});
});

describe("useSets", () => {
	test("should not collide with a string key at the legacy namespace path", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
		});
		const namespace = faker.string.alphanumeric(8);
		const unmanagedValue = faker.string.alphanumeric(10);
		await client.set(`namespace:${namespace}`, unmanagedValue);

		const store = new KeyvValkeyGlide(client, { useSets: true, namespace });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		expect(await client.get(`namespace:${namespace}`)).toBe(unmanagedValue);

		await client.del([`namespace:${namespace}`]);
		await store.disconnect();
	});

	test("should use the sets: prefix for the tracking key", async () => {
		const client = await GlideClient.createClient({
			addresses: [{ host: "localhost", port: 6370 }],
			databaseId: 1,
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
			databaseId: 1,
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

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("should keep tracking in step when set() runs during clear()", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, {
			useSets: true,
			namespace: faker.string.alphanumeric(8),
		});
		const client = await store.getClient();
		const key = faker.string.alphanumeric(10);
		await store.set(key, "first");

		// Another set() lands between the steps of clear().
		const srem = client.srem.bind(client) as (...args: unknown[]) => Promise<unknown>;
		vi.spyOn(client, "srem").mockImplementationOnce((async (...args: unknown[]) => {
			await store.set(key, "second");
			return srem(...args);
		}) as never);
		await store.clear();

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should send clear()'s reads through a batch, which goes to the primary", async () => {
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true, namespace });
		const client = await store.getClient();
		const exec = vi.spyOn(client, "exec");
		const smembers = vi.spyOn(client, "smembers");
		const type = vi.spyOn(client, "type");
		const scan = vi.spyOn(client, "scan");

		await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
		await store.clear();
		store.useSets = false;
		await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
		await store.clear();

		expect(exec).toHaveBeenCalled();
		expect(smembers).not.toHaveBeenCalled();
		expect(type).not.toHaveBeenCalled();
		expect(scan).not.toHaveBeenCalled();
		await store.disconnect();
	});

	test("should skip unlinking when the legacy tracking set reports no members", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true });
		store.namespace = faker.string.alphanumeric(8);
		const client = await store.getClient();
		// clear() reads through batches: SMEMBERS of the tracking set, then TYPE and SMEMBERS of
		// the legacy set. A set emptied between those two reads looks like this.
		vi.spyOn(client, "exec")
			.mockResolvedValueOnce([new Set()])
			.mockResolvedValueOnce(["set"])
			.mockResolvedValueOnce([new Set()]);
		await expect(store.clear()).resolves.toBeUndefined();
		await store.disconnect();
	});

	test("should ignore empty-string members returned from the tracking set", async () => {
		const store = new KeyvValkeyGlide(valkeyUri, { useSets: true });
		const namespace = faker.string.alphanumeric(8);
		store.namespace = namespace;
		const client = await store.getClient();
		await client.sadd(`sets:${namespace}`, [""]);
		await expect(store.clear()).resolves.toBeUndefined();
		await store.disconnect();
	});
});
