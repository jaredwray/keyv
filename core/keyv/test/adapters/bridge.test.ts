import { faker } from "@faker-js/faker";
import { describe, expect, test, vi } from "vitest";
import { KeyvBridgeAdapter, type KeyvBridgeStore } from "../../src/adapters/bridge.js";
import { KeyvEvents } from "../../src/types/keyv.js";

function createMinimalStore() {
	const map = new Map<string, unknown>();
	return {
		async get(key: string) {
			return map.get(key);
		},
		async set(key: string, value: unknown, _ttl?: number) {
			map.set(key, value);
		},
		async delete(key: string) {
			return map.delete(key);
		},
		async clear() {
			map.clear();
		},
		_map: map,
	};
}

function createFullStore() {
	const map = new Map<string, unknown>();
	return {
		async get(key: string) {
			return map.get(key);
		},
		async set(key: string, value: unknown, _ttl?: number) {
			map.set(key, value);
		},
		async delete(key: string) {
			return map.delete(key);
		},
		async clear() {
			map.clear();
		},
		async has(key: string) {
			return map.has(key);
		},
		async hasMany(keys: string[]) {
			return keys.map((key) => map.has(key));
		},
		async getMany(keys: string[]) {
			return keys.map((key) => map.get(key));
		},
		async setMany(entries: Array<{ key: string; value: unknown; ttl?: number }>) {
			for (const entry of entries) {
				map.set(entry.key, entry.value);
			}
			return entries.map(() => true);
		},
		async deleteMany(keys: string[]) {
			return keys.map((key) => map.delete(key));
		},
		async *iterator(_namespace?: string) {
			for (const [key, value] of map) {
				yield [key, value];
			}
		},
		async disconnect() {},
		_map: map,
	};
}

describe("KeyvBridgeAdapter - Constructor and Options", () => {
	test("should accept a store, allow setting a new store, and detect capabilities", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.store).toBe(store);

		const newStore = createMinimalStore();
		bridge.store = newStore;
		expect(bridge.store).toBe(newStore);

		// Minimal store capabilities
		expect(bridge.capabilities.methods.get.exists).toBe(true);
		expect(bridge.capabilities.methods.has.exists).toBe(false);
		expect(bridge.capabilities.methods.iterator.exists).toBe(false);

		// Full store capabilities
		const fullBridge = new KeyvBridgeAdapter(createFullStore());
		expect(fullBridge.capabilities.methods.has.exists).toBe(true);
		expect(fullBridge.capabilities.methods.getMany.exists).toBe(true);
		expect(fullBridge.capabilities.methods.iterator.exists).toBe(true);
		expect(fullBridge.capabilities.methods.disconnect.exists).toBe(true);
	});

	test("namespace and keySeparator options, defaults, and setters", () => {
		const store = createMinimalStore();
		const ns = faker.string.alphanumeric(8);
		const bridge1 = new KeyvBridgeAdapter(store, { namespace: ns, keySeparator: "::" });
		expect(bridge1.namespace).toBe(ns);
		expect(bridge1.keySeparator).toBe("::");

		const bridge2 = new KeyvBridgeAdapter(store);
		expect(bridge2.namespace).toBeUndefined();
		expect(bridge2.keySeparator).toBe(":");

		bridge2.namespace = "test";
		expect(bridge2.namespace).toBe("test");
		bridge2.namespace = undefined;
		expect(bridge2.namespace).toBeUndefined();
		bridge2.keySeparator = "::";
		expect(bridge2.keySeparator).toBe("::");
	});
});

describe("KeyvBridgeAdapter - Key Prefix", () => {
	test("getKeyPrefix with and without namespace and custom separator", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(bridge.getKeyPrefix(key, ns)).toBe(`${ns}:${key}`);
		expect(bridge.getKeyPrefix(key)).toBe(key);

		const bridge2 = new KeyvBridgeAdapter(store, { keySeparator: "::" });
		expect(bridge2.getKeyPrefix(key, ns)).toBe(`${ns}::${key}`);
	});

	test("getKeyPrefixData with and without namespace", () => {
		const store = createMinimalStore();
		const ns = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const bridge = new KeyvBridgeAdapter(store, { namespace: ns });
		expect(bridge.getKeyPrefixData(`${ns}:${key}`)).toEqual({ key, namespace: ns });

		const bridge2 = new KeyvBridgeAdapter(store);
		expect(bridge2.getKeyPrefixData(key)).toEqual({ key });

		// Key that doesn't start with namespace prefix
		const bridge3 = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		expect(bridge3.getKeyPrefixData("other:foo")).toEqual({ key: "other:foo" });
	});
});

describe("KeyvBridgeAdapter - Core Operations (minimal store)", () => {
	test("should set, get, delete, and clear values with and without namespace", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		await bridge.set(key, "value");
		expect(await bridge.get(key)).toBe("value");
		expect(await bridge.set("key", "value")).toBe(true);

		// Delete
		expect(await bridge.delete(key)).toBe(true);
		expect(await bridge.get(key)).toBeUndefined();
		expect(await bridge.delete("nonexistent")).toBe(false);

		// Clear
		await bridge.set("key1", "value1");
		await bridge.clear();
		expect(store._map.size).toBe(0);

		// With namespace
		const ns = faker.string.alphanumeric(8);
		const nsBridge = new KeyvBridgeAdapter(store, { namespace: ns });
		await nsBridge.set("k", "v");
		expect(await nsBridge.get("k")).toBe("v");
		expect(store._map.has(`${ns}:k`)).toBe(true);
	});

	test("should return undefined for missing and null values", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(await bridge.get("nonexistent")).toBeUndefined();
		store._map.set("nullkey", null);
		expect(await bridge.get("nullkey")).toBeUndefined();
	});

	test("should pass ttl to store set", async () => {
		const setSpy = vi.fn().mockResolvedValue(undefined);
		const store: KeyvBridgeStore = { get: vi.fn(), set: setSpy, delete: vi.fn(), clear: vi.fn() };
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key", "value", 5000);
		expect(setSpy).toHaveBeenCalledWith("key", "value", 5000);
	});
});

describe("KeyvBridgeAdapter - TTL / Expiration", () => {
	test("should handle expired, valid, and non-expiring data", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();

		store._map.set(key1, { value: "old", expires: Date.now() - 1000 });
		expect(await bridge.get(key1)).toBeUndefined();
		expect(store._map.has(key1)).toBe(false);

		store._map.set(key2, { value: "fresh", expires: Date.now() + 60_000 });
		expect(await bridge.get(key2)).toEqual({ value: "fresh", expires: expect.any(Number) });

		store._map.set(key3, { value: "permanent" });
		expect(await bridge.get(key3)).toEqual({ value: "permanent" });
	});
});

describe("KeyvBridgeAdapter - Fallback Methods (minimal store)", () => {
	test("has should fallback to get for existing, missing, and expired keys", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		expect(await bridge.has("key1")).toBe(true);
		expect(await bridge.has("nonexistent")).toBe(false);
		store._map.set("expiredKey", { value: "old", expires: Date.now() - 1000 });
		expect(await bridge.has("expiredKey")).toBe(false);
	});

	test("hasMany, getMany, setMany, deleteMany should fallback to individual operations", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");

		expect(await bridge.hasMany(["key1", "key2", "key3"])).toEqual([true, true, false]);
		expect(await bridge.getMany(["key1", "key2", "key3"])).toEqual(["value1", "value2", undefined]);

		const setResult = await bridge.setMany([
			{ key: "k1", value: "v1" },
			{ key: "k2", value: "v2", ttl: 5000 },
		]);
		expect(setResult).toEqual([true, true]);
		expect(await bridge.get("k1")).toBe("v1");

		expect(await bridge.deleteMany(["key1", "key2", "key3"])).toEqual([true, true, false]);
	});

	test("deleteMany should emit error and return false on failure", async () => {
		const store: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn().mockRejectedValue(new Error("delete failed")),
			clear: vi.fn(),
		};
		const bridge = new KeyvBridgeAdapter(store);
		const errors: unknown[] = [];
		bridge.on(KeyvEvents.ERROR, (error: unknown) => {
			errors.push(error);
		});
		expect(await bridge.deleteMany(["key1", "key2"])).toEqual([false, false]);
		expect(errors).toHaveLength(2);
	});

	test("iterator returns empty generator and disconnect is a no-op", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}
		expect(entries).toHaveLength(0);
		await expect(bridge.disconnect()).resolves.toBeUndefined();
	});
});

describe("KeyvBridgeAdapter - Native Delegation (full store)", () => {
	test("has and hasMany should delegate with correct key prefixes", async () => {
		const store = createFullStore();
		const hasSpy = vi.spyOn(store, "has");
		const hasManySpy = vi.spyOn(store, "hasMany");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.has("key1");
		expect(hasSpy).toHaveBeenCalledWith("key1");
		await bridge.hasMany(["key1", "key2"]);
		expect(hasManySpy).toHaveBeenCalledWith(["key1", "key2"]);

		// With namespace
		const nsBridge = new KeyvBridgeAdapter(createFullStore(), { namespace: "ns" });
		const nsHasSpy = vi.spyOn(nsBridge.store, "has");
		const nsHasManySpy = vi.spyOn(nsBridge.store, "hasMany");
		await nsBridge.set("key1", "value1");
		await nsBridge.has("key1");
		expect(nsHasSpy).toHaveBeenCalledWith("ns:key1");
		await nsBridge.hasMany(["key1", "key2"]);
		expect(nsHasManySpy).toHaveBeenCalledWith(["ns:key1", "ns:key2"]);
	});

	test("getMany should delegate and handle expired/null data", async () => {
		const store = createFullStore();
		const getManySpy = vi.spyOn(store, "getMany");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.getMany(["key1", "key2"]);
		expect(getManySpy).toHaveBeenCalledWith(["key1", "key2"]);

		// Expired and null handling
		store._map.set("key1", { value: "fresh", expires: Date.now() + 60_000 });
		store._map.set("key2", { value: "old", expires: Date.now() - 1000 });
		store._map.set("key3", null);
		const result = await bridge.getMany(["key1", "key2", "key3"]);
		expect(result[0]).toEqual({ value: "fresh", expires: expect.any(Number) });
		expect(result[1]).toBeUndefined();
		expect(result[2]).toBeUndefined();
		expect(store._map.has("key2")).toBe(false);

		// With namespace
		const nsBridge = new KeyvBridgeAdapter(createFullStore(), { namespace: "ns" });
		const nsGetManySpy = vi.spyOn(nsBridge.store, "getMany");
		await nsBridge.getMany(["key1", "key2"]);
		expect(nsGetManySpy).toHaveBeenCalledWith(["ns:key1", "ns:key2"]);
	});

	test("setMany, deleteMany, disconnect should delegate with correct key prefixes", async () => {
		const store = createFullStore();
		const setManySpy = vi.spyOn(store, "setMany");
		const deleteManySpy = vi.spyOn(store, "deleteMany");
		const disconnectSpy = vi.spyOn(store, "disconnect");
		const bridge = new KeyvBridgeAdapter(store);

		expect(await bridge.setMany([{ key: "key1", value: "value1" }])).toEqual([true]);
		expect(setManySpy).toHaveBeenCalled();
		await bridge.set("key1", "value1");
		await bridge.deleteMany(["key1"]);
		expect(deleteManySpy).toHaveBeenCalledWith(["key1"]);
		await bridge.disconnect();
		expect(disconnectSpy).toHaveBeenCalled();

		// With namespace
		const nsBridge = new KeyvBridgeAdapter(createFullStore(), { namespace: "ns" });
		const nsSetManySpy = vi.spyOn(nsBridge.store, "setMany");
		const nsDeleteManySpy = vi.spyOn(nsBridge.store, "deleteMany");
		await nsBridge.setMany([{ key: "key1", value: "value1" }]);
		expect(nsSetManySpy).toHaveBeenCalledWith([{ key: "ns:key1", value: "value1" }]);
		await nsBridge.deleteMany(["key1", "key2"]);
		expect(nsDeleteManySpy).toHaveBeenCalledWith(["ns:key1", "ns:key2"]);
	});
});

describe("KeyvBridgeAdapter - Iterator", () => {
	test("should iterate, filter by namespace, and handle expired/non-array entries", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store);
		store._map.set("key1", "value1");
		store._map.set("key2", "value2");
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}
		expect(entries).toHaveLength(2);

		// Namespace filtering
		const nsBridge = new KeyvBridgeAdapter(createFullStore(), { namespace: "ns1" });
		nsBridge.store._map.set("ns1:key1", "value1");
		nsBridge.store._map.set("ns2:key2", "value2");
		const nsEntries: unknown[] = [];
		for await (const entry of nsBridge.iterator()) {
			nsEntries.push(entry);
		}
		expect(nsEntries).toHaveLength(1);
		expect(nsEntries[0]).toEqual(["key1", "value1"]);

		// Expired entries
		const expStore = createFullStore();
		const expBridge = new KeyvBridgeAdapter(expStore);
		expStore._map.set("key1", { value: "fresh", expires: Date.now() + 60_000 });
		expStore._map.set("key2", { value: "old", expires: Date.now() - 1000 });
		const expEntries: unknown[] = [];
		for await (const entry of expBridge.iterator()) {
			expEntries.push(entry);
		}
		expect(expEntries).toHaveLength(1);
		expect(expStore._map.has("key2")).toBe(false);
	});

	test("should handle non-array entries from iterator", async () => {
		const store: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			clear: vi.fn(),
			async *iterator() {
				yield "solo-entry";
			},
		};
		const bridge = new KeyvBridgeAdapter(store);
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual(["solo-entry", undefined]);
	});
});

describe("KeyvBridgeAdapter - Clear with Namespace", () => {
	test("should clear namespaced keys or entire store depending on config", async () => {
		// With namespace + iterator: only namespaced keys
		const store1 = createFullStore();
		const bridge1 = new KeyvBridgeAdapter(store1, { namespace: "ns1" });
		store1._map.set("ns1:key1", "value1");
		store1._map.set("ns2:key2", "value2");
		await bridge1.clear();
		expect(store1._map.has("ns1:key1")).toBe(false);
		expect(store1._map.has("ns2:key2")).toBe(true);

		// No namespace: clear all
		const store2 = createFullStore();
		const bridge2 = new KeyvBridgeAdapter(store2);
		store2._map.set("key1", "value1");
		await bridge2.clear();
		expect(store2._map.size).toBe(0);

		// With namespace but no iterator: clear all
		const store3 = createMinimalStore();
		const bridge3 = new KeyvBridgeAdapter(store3, { namespace: "ns1" });
		store3._map.set("ns1:key1", "value1");
		store3._map.set("ns2:key2", "value2");
		await bridge3.clear();
		expect(store3._map.size).toBe(0);
	});

	test("should handle non-string and non-array iterator entries during clear", async () => {
		// Non-string key entries
		const store1: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn().mockResolvedValue(true),
			clear: vi.fn(),
			async *iterator() {
				yield [123, "value1"];
				yield ["ns1:key1", "value1"];
			},
		};
		const bridge1 = new KeyvBridgeAdapter(store1, { namespace: "ns1" });
		await bridge1.clear();
		expect(store1.delete).toHaveBeenCalledTimes(1);
		expect(store1.delete).toHaveBeenCalledWith("ns1:key1");

		// Non-array entries
		const store2: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn().mockResolvedValue(true),
			clear: vi.fn(),
			async *iterator() {
				yield "ns1:key1";
				yield "ns1:key2";
				yield "other:key3";
			},
		};
		const bridge2 = new KeyvBridgeAdapter(store2, { namespace: "ns1" });
		await bridge2.clear();
		expect(store2.delete).toHaveBeenCalledTimes(2);
	});
});

describe("KeyvBridgeAdapter - Namespace Isolation", () => {
	test("should isolate keys between namespaces", async () => {
		const store = createMinimalStore();
		const bridge1 = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		const bridge2 = new KeyvBridgeAdapter(store, { namespace: "ns2" });
		await bridge1.set("key", "value1");
		await bridge2.set("key", "value2");
		expect(await bridge1.get("key")).toBe("value1");
		expect(await bridge2.get("key")).toBe("value2");
		await bridge1.delete("key");
		expect(await bridge1.get("key")).toBeUndefined();
		expect(await bridge2.get("key")).toBe("value2");
	});
});

describe("KeyvBridgeAdapter - Error Event Forwarding", () => {
	test("should forward error events from store and handle stores without on method", () => {
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const listeners = new Map<string, Array<(...args: any[]) => void>>();
		const store: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			clear: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			on(event: string, listener: (...args: any[]) => void) {
				if (!listeners.has(event)) {
					listeners.set(event, []);
				}
				listeners.get(event)?.push(listener);
				return store;
			},
		};
		const bridge = new KeyvBridgeAdapter(store);
		const errors: unknown[] = [];
		bridge.on(KeyvEvents.ERROR, (error: unknown) => {
			errors.push(error);
		});
		const storeErrorListeners = listeners.get(KeyvEvents.ERROR) ?? [];
		expect(storeErrorListeners).toHaveLength(1);
		storeErrorListeners[0](new Error("store error"));
		expect(errors).toHaveLength(1);

		// Store without on method should not throw
		expect(() => new KeyvBridgeAdapter(createMinimalStore())).not.toThrow();
	});
});

describe("KeyvBridgeAdapter - v5 Adapter Compatibility", () => {
	test("should accept store with opts and pass namespace to iterator", async () => {
		const store: KeyvBridgeStore = {
			opts: { dialect: "redis", url: "redis://localhost:6379" },
			get: vi.fn().mockResolvedValue(undefined),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(true),
			clear: vi.fn().mockResolvedValue(undefined),
		};
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.store.opts).toEqual({ dialect: "redis", url: "redis://localhost:6379" });

		// Pass namespace to iterator
		const iteratorSpy = vi.fn().mockImplementation(function* () {
			yield ["ns1:key1", "value1"];
		});
		const store2: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn().mockResolvedValue(true),
			clear: vi.fn(),
			iterator: iteratorSpy,
		};

		// In iterator()
		const bridge2 = new KeyvBridgeAdapter(store2, { namespace: "ns1" });
		for await (const _entry of bridge2.iterator()) {
			/* consume */
		}
		expect(iteratorSpy).toHaveBeenCalledWith("ns1");

		// In clear()
		iteratorSpy.mockClear();
		await bridge2.clear();
		expect(iteratorSpy).toHaveBeenCalledWith("ns1");

		// Without namespace
		const bridge3 = new KeyvBridgeAdapter(store2);
		iteratorSpy.mockClear();
		for await (const _entry of bridge3.iterator()) {
			/* consume */
		}
		expect(iteratorSpy).toHaveBeenCalledWith(undefined);
	});
});
