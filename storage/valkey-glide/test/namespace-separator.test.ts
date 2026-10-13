import process from "node:process";
import { faker } from "@faker-js/faker";
import { afterEach, describe, expect, test } from "vitest";
import KeyvValkeyGlide, { createKeyv } from "../src/index.js";

async function collect(store: KeyvValkeyGlide) {
	const entries = new Map<string, string | undefined>();
	for await (const [key, value] of store.iterator<string>()) {
		entries.set(key, value);
	}

	return entries;
}

describe.each([false, true])("namespaceSeparator (cluster: %s)", (cluster) => {
	const connect = cluster
		? { cluster: true, addresses: [{ host: "127.0.0.1", port: 7201 }] }
		: { uri: process.env.VALKEY_URI ?? "redis://localhost:6371" };
	const stores: KeyvValkeyGlide[] = [];

	afterEach(async () => {
		for (const store of stores.splice(0)) {
			try {
				await store.clear();
			} finally {
				await store.disconnect();
			}
		}
	});

	test("defaults to :: and allows changing the separator", async () => {
		const store = new KeyvValkeyGlide(connect, { namespace: faker.string.alphanumeric(12) });
		stores.push(store);
		expect(store.namespaceSeparator).toBe("::");
		store.namespaceSeparator = "--";
		expect(store.namespaceSeparator).toBe("--");
		await store.set("key", "value");
		expect(await store.client.get(`namespace:${store.namespace}--key`)).toBe("value");
		expect(await collect(store)).toEqual(new Map([["key", "value"]]));
	});

	describe.each([false, true])("useSets: %s", (useSets) => {
		test.each(["::", ":", "*?[x]\\", ""])(
			"uses separator %j for all operations",
			async (separator) => {
				const namespace = faker.string.alphanumeric(12);
				const store = new KeyvValkeyGlide({
					...connect,
					namespace,
					useSets,
					namespaceSeparator: separator,
				});
				stores.push(store);
				const prefix = `${useSets ? "sets" : "namespace"}:${namespace}${separator}`;
				const key = `first${separator}part`;
				expect(await store.set(key, "one")).toBe(true);
				expect(await store.client.get(`${prefix}${key}`)).toBe("one");
				expect(await store.get(key)).toBe("one");
				expect(await store.has(key)).toBe(true);
				expect(await store.setMany([{ key: "second", value: "two" }])).toEqual([true]);
				expect(await store.getMany([key, "second"])).toEqual(["one", "two"]);
				expect(await store.hasMany([key, "second", "missing"])).toEqual([true, true, false]);
				expect(await collect(store)).toEqual(
					new Map([
						[key, "one"],
						["second", "two"],
					]),
				);
				if (useSets) {
					expect(await store.client.sismember(`sets:${namespace}`, `${prefix}${key}`)).toBe(true);
				}

				expect(await store.delete(key)).toBe(true);
				expect(await store.deleteMany(["second", "missing"])).toEqual([true, false]);
				expect(await store.getMany([key, "second"])).toEqual([undefined, undefined]);
				await store.set("clear-me", "value");
				await store.clear();
				expect(await store.client.exists([`${prefix}clear-me`])).toBe(0);
			},
		);
	});

	test("escapes glob characters in the separator for scanning and clearing", async () => {
		const namespace = faker.string.alphanumeric(12);
		const own = new KeyvValkeyGlide(connect, { namespace, namespaceSeparator: "*?[x]\\" });
		const other = new KeyvValkeyGlide(connect, { namespace, namespaceSeparator: "ABx\\" });
		stores.push(own, other);
		await own.set("key", "own");
		await other.set("key", "other");
		expect(await collect(own)).toEqual(new Map([["key", "own"]]));
		await own.clear();
		expect(await other.get("key")).toBe("other");
	});

	test("uses the default separator to distinguish users from users:archive", async () => {
		const namespace = faker.string.alphanumeric(12);
		const own = new KeyvValkeyGlide(connect, { namespace });
		const other = new KeyvValkeyGlide(connect, { namespace: `${namespace}:archive` });
		stores.push(own, other);
		await own.set("key", "own");
		await other.set("key", "other");
		expect(await collect(own)).toEqual(new Map([["key", "own"]]));
		await own.clear();
		expect(await other.get("key")).toBe("other");
	});

	test("does not add a separator to unprefixed keys", async () => {
		const store = new KeyvValkeyGlide(connect, { namespaceSeparator: "--" });
		const key = faker.string.alphanumeric(12);
		try {
			await store.set(key, "value");
			expect(await store.client.get(key)).toBe("value");
		} finally {
			await store.delete(key);
			await store.disconnect();
		}
	});

	test("applies a custom separator to the default tracking set's data keys", async () => {
		const store = new KeyvValkeyGlide(connect, { useSets: true, namespaceSeparator: "--" });
		stores.push(store);
		const key = faker.string.alphanumeric(12);
		await store.set(key, "value");
		expect(await store.client.get(`sets--${key}`)).toBe("value");
		expect(await store.client.sismember("sets", `sets--${key}`)).toBe(true);
		expect((await collect(store)).get(key)).toBe("value");
	});

	test("honors the second options argument and passes it through createKeyv", async () => {
		const keyv = createKeyv(
			{ ...connect, namespaceSeparator: "ignored" },
			{ namespace: faker.string.alphanumeric(12), namespaceSeparator: "--" },
		);
		const store = keyv.store as KeyvValkeyGlide;
		stores.push(store);
		expect(store.namespaceSeparator).toBe("--");
		await keyv.set("key", "value");
		expect(await keyv.get("key")).toBe("value");
		expect(await store.client.exists([`namespace:${store.namespace}--key`])).toBe(1);
	});

	test("accepts an empty separator with an existing client", async () => {
		const original = new KeyvValkeyGlide(connect);
		const store = new KeyvValkeyGlide(await original.getClient(), {
			namespace: faker.string.alphanumeric(12),
			namespaceSeparator: "",
		});
		stores.push(store);
		expect(store.namespaceSeparator).toBe("");
		await store.set("key", "value");
		expect(await store.client.get(`namespace:${store.namespace}key`)).toBe("value");
	});
});
