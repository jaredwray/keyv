import { faker } from "@faker-js/faker";
import { describe, expect, test, vi } from "vitest";
import { KeyvBridgeAdapter, type KeyvBridgeStore } from "../../src/adapters/bridge.js";
import { KeyvEvents } from "../../src/types.js";

/**
 * Creates a minimal async store backed by a Map (no optional methods).
 */
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

/**
 * Creates a full async store backed by a Map (with all optional methods).
 */
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
		async *iterator() {
			for (const [key, value] of map) {
				yield [key, value];
			}
		},
		async disconnect() {},
		_map: map,
	};
}

describe("KeyvBridgeAdapter - Constructor and Options", () => {
	test("should accept a store as the first argument", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.store).toBe(store);
	});

	test("should allow setting a new store", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const newStore = createMinimalStore();
		bridge.store = newStore;
		expect(bridge.store).toBe(newStore);
	});

	test("should set namespace from options", () => {
		const store = createMinimalStore();
		const namespace = faker.string.alphanumeric(8);
		const bridge = new KeyvBridgeAdapter(store, { namespace });
		expect(bridge.namespace).toBe(namespace);
	});

	test("should default namespace to undefined", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.namespace).toBeUndefined();
	});

	test("should detect capabilities for a minimal store", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.capabilities.get).toBe(true);
		expect(bridge.capabilities.set).toBe(true);
		expect(bridge.capabilities.delete).toBe(true);
		expect(bridge.capabilities.clear).toBe(true);
		expect(bridge.capabilities.has).toBe(false);
		expect(bridge.capabilities.iterator).toBe(false);
		expect(bridge.capabilities.disconnect).toBe(false);
	});

	test("should detect capabilities for a full store", () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.capabilities.has).toBe(true);
		expect(bridge.capabilities.hasMany).toBe(true);
		expect(bridge.capabilities.getMany).toBe(true);
		expect(bridge.capabilities.setMany).toBe(true);
		expect(bridge.capabilities.deleteMany).toBe(true);
		expect(bridge.capabilities.iterator).toBe(true);
		expect(bridge.capabilities.disconnect).toBe(true);
	});

	test("should set keySeparator from options", () => {
		const store = createMinimalStore();
		const separator = "::";
		const bridge = new KeyvBridgeAdapter(store, { keySeparator: separator });
		expect(bridge.keySeparator).toBe(separator);
	});

	test("should default keySeparator to :", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.keySeparator).toBe(":");
	});

	test("should allow setting keySeparator", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		bridge.keySeparator = "::";
		expect(bridge.keySeparator).toBe("::");
	});

	test("should allow setting namespace", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const namespace = faker.string.alphanumeric(8);
		bridge.namespace = namespace;
		expect(bridge.namespace).toBe(namespace);
	});

	test("should allow setting namespace to undefined", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store, { namespace: "test" });
		bridge.namespace = undefined;
		expect(bridge.namespace).toBeUndefined();
	});
});

describe("KeyvBridgeAdapter - Key Prefix", () => {
	test("should return prefixed key when namespace is provided", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(bridge.getKeyPrefix(key, ns)).toBe(`${ns}:${key}`);
	});

	test("should return raw key when no namespace is provided", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		expect(bridge.getKeyPrefix(key)).toBe(key);
	});

	test("should use custom keySeparator in prefix", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store, { keySeparator: "::" });
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(bridge.getKeyPrefix(key, ns)).toBe(`${ns}::${key}`);
	});

	test("should parse key prefix data with namespace", () => {
		const store = createMinimalStore();
		const ns = faker.string.alphanumeric(8);
		const key = faker.string.uuid();
		const bridge = new KeyvBridgeAdapter(store, { namespace: ns });
		expect(bridge.getKeyPrefixData(`${ns}:${key}`)).toEqual({
			key,
			namespace: ns,
		});
	});

	test("should parse key prefix data without namespace", () => {
		const store = createMinimalStore();
		const key = faker.string.uuid();
		const bridge = new KeyvBridgeAdapter(store);
		expect(bridge.getKeyPrefixData(key)).toEqual({ key });
	});

	test("should return raw key when key does not start with namespace prefix", () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		const key = "other:foo";
		expect(bridge.getKeyPrefixData(key)).toEqual({ key });
	});
});

describe("KeyvBridgeAdapter - Core Operations (minimal store)", () => {
	test("should set and get a value", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		const value = faker.string.alphanumeric(16);
		await bridge.set(key, value);
		const result = await bridge.get(key);
		expect(result).toBe(value);
	});

	test("should set and get a value with namespace", async () => {
		const store = createMinimalStore();
		const ns = faker.string.alphanumeric(8);
		const bridge = new KeyvBridgeAdapter(store, { namespace: ns });
		const key = faker.string.uuid();
		const value = faker.string.alphanumeric(16);
		await bridge.set(key, value);
		const result = await bridge.get(key);
		expect(result).toBe(value);
		// Verify key is stored with prefix
		expect(store._map.has(`${ns}:${key}`)).toBe(true);
	});

	test("should return undefined for missing key", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const result = await bridge.get("nonexistent");
		expect(result).toBeUndefined();
	});

	test("should return undefined for null value", async () => {
		const store = createMinimalStore();
		store._map.set("nullkey", null);
		const bridge = new KeyvBridgeAdapter(store);
		const result = await bridge.get("nullkey");
		expect(result).toBeUndefined();
	});

	test("should delete a key", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		await bridge.set(key, "value");
		const deleted = await bridge.delete(key);
		expect(deleted).toBe(true);
		const result = await bridge.get(key);
		expect(result).toBeUndefined();
	});

	test("should return false when deleting non-existent key", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const deleted = await bridge.delete("nonexistent");
		expect(deleted).toBe(false);
	});

	test("should clear the store", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		await bridge.clear();
		expect(store._map.size).toBe(0);
	});

	test("should set return true", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const result = await bridge.set("key", "value");
		expect(result).toBe(true);
	});

	test("should pass ttl to store set", async () => {
		const setSpy = vi.fn().mockResolvedValue(undefined);
		const store: KeyvBridgeStore = {
			get: vi.fn(),
			set: setSpy,
			delete: vi.fn(),
			clear: vi.fn(),
		};
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key", "value", 5000);
		expect(setSpy).toHaveBeenCalledWith("key", "value", 5000);
	});
});

describe("KeyvBridgeAdapter - TTL / Expiration", () => {
	test("should return undefined for expired data on get", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		// Store expired data
		store._map.set(key, { value: "old", expires: Date.now() - 1000 });
		const result = await bridge.get(key);
		expect(result).toBeUndefined();
		// Should have been deleted
		expect(store._map.has(key)).toBe(false);
	});

	test("should return valid data that is not expired", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		const data = { value: "fresh", expires: Date.now() + 60_000 };
		store._map.set(key, data);
		const result = await bridge.get(key);
		expect(result).toEqual(data);
	});

	test("should return data without expires field (non-expiring)", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const key = faker.string.uuid();
		const data = { value: "permanent" };
		store._map.set(key, data);
		const result = await bridge.get(key);
		expect(result).toEqual(data);
	});
});

describe("KeyvBridgeAdapter - Fallback Methods (minimal store)", () => {
	test("has should fallback to get - existing key", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		const result = await bridge.has("key1");
		expect(result).toBe(true);
	});

	test("has should fallback to get - missing key", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const result = await bridge.has("nonexistent");
		expect(result).toBe(false);
	});

	test("has should return false for expired data", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		store._map.set("expiredKey", { value: "old", expires: Date.now() - 1000 });
		const result = await bridge.has("expiredKey");
		expect(result).toBe(false);
	});

	test("hasMany should fallback to looping has", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		const result = await bridge.hasMany(["key1", "key2", "key3"]);
		expect(result).toEqual([true, true, false]);
	});

	test("getMany should fallback to looping get", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		const result = await bridge.getMany(["key1", "key2", "key3"]);
		expect(result).toEqual(["value1", "value2", undefined]);
	});

	test("setMany should fallback to looping set", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const entries = [
			{ key: "key1", value: "value1" },
			{ key: "key2", value: "value2", ttl: 5000 },
		];
		const result = await bridge.setMany(entries);
		expect(result).toEqual([true, true]);
		expect(await bridge.get("key1")).toBe("value1");
		expect(await bridge.get("key2")).toBe("value2");
	});

	test("deleteMany should fallback to looping delete", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.set("key2", "value2");
		const result = await bridge.deleteMany(["key1", "key2", "key3"]);
		expect(result).toEqual([true, true, false]);
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
		const result = await bridge.deleteMany(["key1", "key2"]);
		expect(result).toEqual([false, false]);
		expect(errors).toHaveLength(2);
		expect((errors[0] as Error).message).toBe("delete failed");
	});

	test("iterator should return empty generator", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}

		expect(entries).toHaveLength(0);
	});

	test("disconnect should be a no-op", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store);
		await expect(bridge.disconnect()).resolves.toBeUndefined();
	});
});

describe("KeyvBridgeAdapter - Native Delegation (full store)", () => {
	test("has should delegate to store.has", async () => {
		const store = createFullStore();
		const hasSpy = vi.spyOn(store, "has");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.has("key1");
		expect(hasSpy).toHaveBeenCalledWith("key1");
	});

	test("has should delegate with prefixed key when namespace set", async () => {
		const store = createFullStore();
		const hasSpy = vi.spyOn(store, "has");
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns" });
		await bridge.set("key1", "value1");
		await bridge.has("key1");
		expect(hasSpy).toHaveBeenCalledWith("ns:key1");
	});

	test("hasMany should delegate to store.hasMany", async () => {
		const store = createFullStore();
		const hasManySpy = vi.spyOn(store, "hasMany");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.hasMany(["key1", "key2"]);
		expect(hasManySpy).toHaveBeenCalledWith(["key1", "key2"]);
	});

	test("hasMany should delegate with prefixed keys when namespace set", async () => {
		const store = createFullStore();
		const hasManySpy = vi.spyOn(store, "hasMany");
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns" });
		await bridge.hasMany(["key1", "key2"]);
		expect(hasManySpy).toHaveBeenCalledWith(["ns:key1", "ns:key2"]);
	});

	test("getMany should delegate to store.getMany", async () => {
		const store = createFullStore();
		const getManySpy = vi.spyOn(store, "getMany");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.getMany(["key1", "key2"]);
		expect(getManySpy).toHaveBeenCalledWith(["key1", "key2"]);
	});

	test("getMany should handle expired data in delegated results", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store);
		store._map.set("key1", { value: "fresh", expires: Date.now() + 60_000 });
		store._map.set("key2", { value: "old", expires: Date.now() - 1000 });
		const result = await bridge.getMany(["key1", "key2", "key3"]);
		expect(result[0]).toEqual({ value: "fresh", expires: expect.any(Number) });
		expect(result[1]).toBeUndefined();
		expect(result[2]).toBeUndefined();
		// Expired key should be deleted
		expect(store._map.has("key2")).toBe(false);
	});

	test("getMany should handle null results from store", async () => {
		const store = createFullStore();
		store._map.set("key1", null);
		const bridge = new KeyvBridgeAdapter(store);
		const result = await bridge.getMany(["key1"]);
		expect(result[0]).toBeUndefined();
	});

	test("getMany should delegate with prefixed keys when namespace set", async () => {
		const store = createFullStore();
		const getManySpy = vi.spyOn(store, "getMany");
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns" });
		await bridge.getMany(["key1", "key2"]);
		expect(getManySpy).toHaveBeenCalledWith(["ns:key1", "ns:key2"]);
	});

	test("setMany should delegate to store.setMany", async () => {
		const store = createFullStore();
		const setManySpy = vi.spyOn(store, "setMany");
		const bridge = new KeyvBridgeAdapter(store);
		const entries = [{ key: "key1", value: "value1" }];
		const result = await bridge.setMany(entries);
		expect(setManySpy).toHaveBeenCalled();
		expect(result).toEqual([true]);
	});

	test("setMany should delegate with prefixed keys when namespace set", async () => {
		const store = createFullStore();
		const setManySpy = vi.spyOn(store, "setMany");
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns" });
		const entries = [{ key: "key1", value: "value1" }];
		await bridge.setMany(entries);
		expect(setManySpy).toHaveBeenCalledWith([{ key: "ns:key1", value: "value1" }]);
	});

	test("deleteMany should delegate to store.deleteMany", async () => {
		const store = createFullStore();
		const deleteManySpy = vi.spyOn(store, "deleteMany");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.set("key1", "value1");
		await bridge.deleteMany(["key1"]);
		expect(deleteManySpy).toHaveBeenCalledWith(["key1"]);
	});

	test("deleteMany should delegate with prefixed keys when namespace set", async () => {
		const store = createFullStore();
		const deleteManySpy = vi.spyOn(store, "deleteMany");
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns" });
		await bridge.deleteMany(["key1", "key2"]);
		expect(deleteManySpy).toHaveBeenCalledWith(["ns:key1", "ns:key2"]);
	});

	test("disconnect should delegate to store.disconnect", async () => {
		const store = createFullStore();
		const disconnectSpy = vi.spyOn(store, "disconnect");
		const bridge = new KeyvBridgeAdapter(store);
		await bridge.disconnect();
		expect(disconnectSpy).toHaveBeenCalled();
	});
});

describe("KeyvBridgeAdapter - Iterator", () => {
	test("should iterate over all entries when store has iterator", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store);
		store._map.set("key1", "value1");
		store._map.set("key2", "value2");
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}

		expect(entries).toHaveLength(2);
		expect(entries).toContainEqual(["key1", "value1"]);
		expect(entries).toContainEqual(["key2", "value2"]);
	});

	test("should filter by namespace when set", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		store._map.set("ns1:key1", "value1");
		store._map.set("ns2:key2", "value2");
		store._map.set("ns1:key3", "value3");
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}

		expect(entries).toHaveLength(2);
		expect(entries).toContainEqual(["key1", "value1"]);
		expect(entries).toContainEqual(["key3", "value3"]);
	});

	test("should skip and delete expired entries", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store);
		store._map.set("key1", { value: "fresh", expires: Date.now() + 60_000 });
		store._map.set("key2", { value: "old", expires: Date.now() - 1000 });
		const entries: unknown[] = [];
		for await (const entry of bridge.iterator()) {
			entries.push(entry);
		}

		expect(entries).toHaveLength(1);
		expect(store._map.has("key2")).toBe(false);
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
	test("should clear only namespaced keys when store has iterator", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		store._map.set("ns1:key1", "value1");
		store._map.set("ns1:key2", "value2");
		store._map.set("ns2:key3", "value3");
		await bridge.clear();
		expect(store._map.has("ns1:key1")).toBe(false);
		expect(store._map.has("ns1:key2")).toBe(false);
		expect(store._map.has("ns2:key3")).toBe(true);
	});

	test("should clear entire store when no namespace", async () => {
		const store = createFullStore();
		const bridge = new KeyvBridgeAdapter(store);
		store._map.set("key1", "value1");
		store._map.set("key2", "value2");
		await bridge.clear();
		expect(store._map.size).toBe(0);
	});

	test("should clear entire store when namespace set but no iterator", async () => {
		const store = createMinimalStore();
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		store._map.set("ns1:key1", "value1");
		store._map.set("ns2:key2", "value2");
		await bridge.clear();
		// Without iterator, entire store is cleared
		expect(store._map.size).toBe(0);
	});

	test("should handle iterator entries that are not strings during clear", async () => {
		const entries = [
			[123, "value1"],
			["ns1:key1", "value1"],
		];
		const store: KeyvBridgeStore = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn().mockResolvedValue(true),
			clear: vi.fn(),
			async *iterator() {
				for (const entry of entries) {
					yield entry;
				}
			},
		};
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		await bridge.clear();
		// Only ns1:key1 should be deleted (number key is skipped)
		expect(store.delete).toHaveBeenCalledTimes(1);
		expect(store.delete).toHaveBeenCalledWith("ns1:key1");
	});

	test("should handle non-array iterator entries during clear", async () => {
		const store: KeyvBridgeStore = {
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
		const bridge = new KeyvBridgeAdapter(store, { namespace: "ns1" });
		await bridge.clear();
		expect(store.delete).toHaveBeenCalledTimes(2);
		expect(store.delete).toHaveBeenCalledWith("ns1:key1");
		expect(store.delete).toHaveBeenCalledWith("ns1:key2");
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
