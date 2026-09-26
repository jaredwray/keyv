import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { createKeyv, KeyvMemoryAdapter } from "../../src/adapters/memory.js";
import { delay as sleep } from "../test-utils.js";

describe("Keyv Generic Store Options", () => {
	test("should accept a store, allow replacement, and expose capabilities", () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		expect(keyv.store).toBe(store);
		keyv.store = new Map();
		expect(keyv.store).not.toBe(store);

		const cap = keyv.capabilities;
		expect(cap.store).toBe("mapLike");
		expect(cap.methods.get.exists).toBe(true);
		expect(cap.methods.get.methodType).toBe("sync");
	});

	test("should handle namespace and keySeparator options", () => {
		const ns = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(new Map(), { namespace: ns, keySeparator: "::" });
		expect(keyv.namespace).toBe(ns);
		expect(keyv.keySeparator).toBe("::");
		keyv.keySeparator = "~";
		expect(keyv.keySeparator).toBe("~");
		keyv.namespace = "new";
		expect(keyv.namespace).toBe("new");
	});
});

describe("Keyv Generic Store Namespace", () => {
	test("should handle key prefix with and without namespace", () => {
		const keyv = new KeyvMemoryAdapter(new Map());
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(keyv.getKeyPrefix(key, ns)).toBe(`${ns}:${key}`);
		expect(keyv.getKeyPrefix(key)).toBe(key);

		// Key prefix data
		const keyv2 = new KeyvMemoryAdapter(new Map(), { namespace: ns });
		expect(keyv2.getKeyPrefixData(`${ns}:${key}`)).toEqual({ key, namespace: ns });
		expect(keyv2.getKeyPrefixData(key)).toEqual({ key });

		// No namespace configured
		expect(keyv.getKeyPrefixData("user:123")).toEqual({ key: "user:123" });
	});
});

describe("Keyv Generic set / get / has Operations", () => {
	test("should set, get, setMany, and handle missing keys", async () => {
		const keyv = new KeyvMemoryAdapter(new Map());
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
		expect(await keyv.get(faker.string.uuid())).toBe(undefined);

		// setMany
		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		const result = await keyv.setMany([
			{ key: k1, value: "v1" },
			{ key: k2, value: "v2" },
		]);
		expect(result).toEqual([true, true]);
		expect(await keyv.get(k1)).toBe("v1");
	});

	test("should handle TTL expiration", async () => {
		const keyv = new KeyvMemoryAdapter(new Map());
		const key = faker.string.uuid();
		await keyv.set(key, { value: "test", expires: Date.now() + 10 }, 10);
		await sleep(20);
		expect(await keyv.get(key)).toBe(undefined);
	});

	test("should handle has, hasMany, and falsy values", async () => {
		const keyv = new KeyvMemoryAdapter(new Map());
		const k1 = faker.string.uuid();
		await keyv.set(k1, "val");
		expect(await keyv.has(k1)).toBe(true);
		expect(await keyv.has(faker.string.uuid())).toBe(false);

		// Falsy values
		const keys = [
			faker.string.uuid(),
			faker.string.uuid(),
			faker.string.uuid(),
			faker.string.uuid(),
		];
		await keyv.set(keys[0], 0);
		await keyv.set(keys[1], "");
		await keyv.set(keys[2], false);
		await keyv.set(keys[3], null);
		for (const k of keys) {
			expect(await keyv.has(k)).toBe(true);
		}

		// Expired has
		const expKey = faker.string.uuid();
		await keyv.set(expKey, "test", 1);
		await new Promise((r) => {
			setTimeout(r, 10);
		});
		expect(await keyv.has(expKey)).toBe(false);

		// hasMany
		const k2 = faker.string.uuid();
		await keyv.set(k2, "v2");
		expect(await keyv.hasMany([k1, k2, faker.string.uuid()])).toEqual([true, true, false]);
	});

	test("should handle getMany with expired keys", async () => {
		const keyv = new KeyvMemoryAdapter(new Map());
		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		await keyv.set(k1, { value: "v1", expires: Date.now() + 1 }, 1);
		await keyv.set(k2, "v2");
		await new Promise((r) => {
			setTimeout(r, 10);
		});
		const values = await keyv.getMany([k1, k2, faker.string.uuid()]);
		expect(values[0]).toBe(undefined);
		expect(values[1]).toBe("v2");
		expect(values[2]).toBe(undefined);
	});
});

describe("Keyv Generic Delete / Clear Operations", () => {
	test("should delete, deleteMany, and clear with namespace", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns1 });

		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		const k3 = faker.string.uuid();
		await keyv.set(k1, "v1");
		await keyv.set(k2, "v2");
		await keyv.set(k3, "v3");

		// Delete single
		await keyv.delete(k1);
		expect(await keyv.get(k1)).toBe(undefined);

		// DeleteMany
		await keyv.deleteMany([k2]);
		expect(await keyv.get(k2)).toBe(undefined);
		expect(await keyv.get(k3)).toBe("v3");

		// Clear namespace only
		store.set(`${ns2}:other`, { value: "other", expires: undefined });
		await keyv.clear();
		expect(store.has(`${ns2}:other`)).toBe(true);

		// Clear entire store when no namespace
		const keyv2 = new KeyvMemoryAdapter(store);
		await keyv2.clear();
		expect(store.size).toBe(0);
	});

	test("should emit errors on deleteMany and setMany failures", async () => {
		// deleteMany error
		const store1 = new Map();
		store1.delete = () => {
			throw new Error("delete error");
		};
		const keyv1 = new KeyvMemoryAdapter(store1);
		let errorEmitted = false;
		keyv1.on("error", () => {
			errorEmitted = true;
		});
		await keyv1.deleteMany([faker.string.uuid()]);
		expect(errorEmitted).toBe(true);

		// setMany error via createKeyv
		const store2 = new Map();
		store2.set = () => {
			throw new Error("Test Error");
		};
		const keyv2 = createKeyv(store2);
		let setError = false;
		keyv2.on("error", () => {
			setError = true;
		});
		const result = await keyv2.setMany(
			Array.from({ length: 3 }, () => ({ key: faker.string.uuid(), value: "v" })),
		);
		expect(result).toEqual([false, false, false]);
		expect(setError).toBe(true);

		// deleteMany error via createKeyv
		const store3 = new Map();
		const keyv3 = createKeyv(store3);
		keyv3.store.deleteMany = () => {
			throw new Error("Test Error");
		};
		let deleteError = false;
		keyv3.on("error", () => {
			deleteError = true;
		});
		const delResult = await keyv3.deleteMany(Array.from({ length: 3 }, () => faker.string.uuid()));
		expect(delResult).toEqual([false, false, false]);
		expect(deleteError).toBe(true);
	});

	test("hasMany through createKeyv with store hasMany", async () => {
		const keyv = createKeyv(new Map());
		const testData = Array.from({ length: 5 }, () => ({
			key: faker.string.uuid(),
			value: faker.lorem.sentence(),
		}));
		await keyv.setMany(testData);
		expect((await keyv.hasMany(testData.map((d) => d.key))).length).toBe(5);

		// Delete one and check
		await keyv.delete(testData[0].key);
		const result = await keyv.hasMany(testData.map((d) => d.key));
		expect(result[0]).toBe(false);
		expect(result.length).toBe(5);
	});
});

describe("createKeyv namespace forwarding", () => {
	test("should prefix and isolate keys with namespace", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const kv1 = createKeyv(store, { namespace: ns1 });
		const kv2 = createKeyv(store, { namespace: ns2 });
		await kv1.set(key, "v1");
		await kv2.set(key, "v2");
		expect(store.has(`${ns1}:${key}`)).toBe(true);
		expect(store.has(key)).toBe(false);
		expect(await kv1.get(key)).toBe("v1");
		expect(await kv2.get(key)).toBe("v2");
	});
});

describe("Keyv Generic Store Iterator", () => {
	test("should iterate, filter by namespace, and strip prefix", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);

		// No namespace
		const keyv = new KeyvMemoryAdapter(store);
		const k1 = faker.string.uuid();
		const k2 = faker.string.uuid();
		await keyv.set(k1, "v1");
		await keyv.set(k2, "v2");
		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(2);
		store.clear();

		// With namespace filtering
		const nsKeyv = new KeyvMemoryAdapter(new Map(), { namespace: ns1 });
		const nk1 = faker.string.uuid();
		const nk2 = faker.string.uuid();
		await nsKeyv.set(nk1, "v1");
		await nsKeyv.set(nk2, "v2");
		nsKeyv.store.set(`${ns2}:other`, { value: "other", expires: undefined });
		const nsEntries: Array<[string, unknown]> = [];
		for await (const entry of nsKeyv.iterator()) {
			nsEntries.push(entry as [string, unknown]);
		}
		expect(nsEntries.length).toBe(2);
		// Keys should not have namespace prefix
		expect(nsEntries.map(([k]) => k).sort()).toEqual([nk1, nk2].sort());
	});

	test("should skip expired entries and delete them", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const k1 = faker.string.uuid();
		await keyv.set(k1, "v1");
		store.set("expired", { value: "old", expires: Date.now() - 1000 });
		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(1);
		expect(store.has("expired")).toBe(false);
	});

	test("should return empty iterator when store does not support entries", async () => {
		const customStore = {
			get: () => undefined,
			set: () => {},
			delete: () => true,
			clear: () => {},
			has: () => false,
		};
		const keyv = new KeyvMemoryAdapter(customStore);
		const entries: unknown[] = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry);
		}
		expect(entries.length).toBe(0);
	});

	test("should work with custom key separator", async () => {
		const store = new Map();
		const ns1 = faker.string.alphanumeric(8);
		const ns2 = faker.string.alphanumeric(8);
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns1, keySeparator: ":" });
		const k1 = faker.string.uuid();
		await keyv.set(k1, "v1");
		store.set(`${ns2}:other`, { value: "other", expires: undefined });
		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe(k1);
	});
});
