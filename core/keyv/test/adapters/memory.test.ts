import { faker } from "@faker-js/faker";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createKeyv, KeyvMemoryAdapter } from "../../src/adapters/memory.js";
import { Keyv } from "../../src/keyv.js";
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

	test("should handle namespace and namespaceSeparator options", () => {
		const ns = faker.string.alphanumeric(8);
		expect(new KeyvMemoryAdapter(new Map()).namespaceSeparator).toBe("::");
		const keyv = new KeyvMemoryAdapter(new Map(), { namespace: ns, namespaceSeparator: ":" });
		expect(keyv.namespace).toBe(ns);
		expect(keyv.namespaceSeparator).toBe(":");
		keyv.namespaceSeparator = "~";
		expect(keyv.namespaceSeparator).toBe("~");
		// An empty separator is kept rather than replaced by the default
		expect(new KeyvMemoryAdapter(new Map(), { namespaceSeparator: "" }).namespaceSeparator).toBe(
			"",
		);
		keyv.namespace = "new";
		expect(keyv.namespace).toBe("new");
	});
});

describe("Keyv Generic Store Namespace", () => {
	test("should handle key prefix with and without namespace", () => {
		const keyv = new KeyvMemoryAdapter(new Map());
		const key = faker.string.uuid();
		const ns = faker.string.alphanumeric(8);
		expect(keyv.getKeyPrefix(key, ns)).toBe(`${ns}::${key}`);
		expect(keyv.getKeyPrefix(key)).toBe(key);

		// Key prefix data
		const keyv2 = new KeyvMemoryAdapter(new Map(), { namespace: ns });
		expect(keyv2.getKeyPrefixData(`${ns}::${key}`)).toEqual({ key, namespace: ns });
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
		store.set(`${ns2}::other`, { value: "other", expires: undefined });
		await keyv.clear();
		expect(store.has(`${ns2}::other`)).toBe(true);

		// Clear entire store when no namespace
		const keyv2 = new KeyvMemoryAdapter(store);
		await keyv2.clear();
		expect(store.size).toBe(0);
	});

	test("should report expired entries as missing from delete and deleteMany and remove them", async () => {
		const store = new Map();
		const keyv = new KeyvMemoryAdapter(store);
		const expiredKey = faker.string.uuid();
		const expiredManyKey = faker.string.uuid();
		const futureKey = faker.string.uuid();
		const liveKey = faker.string.uuid();
		await keyv.set(expiredKey, "v", Date.now() - 1000);
		await keyv.set(expiredManyKey, "v", Date.now() - 1000);
		await keyv.set(futureKey, "v", Date.now() + 60_000);
		await keyv.set(liveKey, "v");
		expect(store.size).toBe(4);

		expect(await keyv.delete(expiredKey)).toBe(false);
		expect(
			await keyv.deleteMany([expiredManyKey, futureKey, liveKey, faker.string.uuid()]),
		).toEqual([false, true, true, false]);
		expect(store.size).toBe(0);
	});

	test("should reject from delete when the store's delete rejects", async () => {
		const store = new Map();
		store.delete = async () => {
			throw new Error("delete error");
		};
		const keyv = new KeyvMemoryAdapter(store);
		await expect(keyv.delete(faker.string.uuid())).rejects.toThrow("delete error");
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
		expect(store.has(`${ns1}::${key}`)).toBe(true);
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
		nsKeyv.store.set(`${ns2}::other`, { value: "other", expires: undefined });
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

	test("should refuse a namespaced clear() when the store has no keys()", async () => {
		const map = new Map<string, unknown>();
		const store = {
			get: (key: string) => map.get(key),
			set: (key: string, value: unknown) => map.set(key, value),
			delete: (key: string) => map.delete(key),
			clear: () => map.clear(),
			has: (key: string) => map.has(key),
		};
		const adapter = new KeyvMemoryAdapter(store, { namespace: "ns1" });
		await adapter.set("key1", "value1");
		map.set("ns2:key2", { value: "value2" });

		await expect(adapter.clear()).rejects.toThrow(
			`Can't clear namespace "ns1": the store has no keys()`,
		);
		expect(map.size).toBe(2);

		// Through Keyv the error is emitted, and nothing is removed
		const keyv = createKeyv(store, { namespace: "ns1" });
		const errors: unknown[] = [];
		keyv.on("error", (error: unknown) => {
			errors.push(error);
		});
		await keyv.clear();
		expect(errors).toHaveLength(1);
		expect(map.size).toBe(2);

		// Without a namespace the whole store is cleared on purpose
		adapter.namespace = undefined;
		await adapter.clear();
		expect(map.size).toBe(0);
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
		const keyv = new KeyvMemoryAdapter(store, { namespace: ns1, namespaceSeparator: ":" });
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

describe("Keyv Generic Store clearExpired / clearExpiredInterval", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	/**
	 * A minimal store split into internal Maps, like BigMap. A key's shard is the number before
	 * its first `:`, so tests can place entries in a chosen shard.
	 */
	function createShardedStore(shardCount: number) {
		const shards = Array.from({ length: shardCount }, () => new Map<string, unknown>());
		const shardOf = (key: string) => shards[Number(key.split(":")[0])];
		return {
			shards,
			storeSize: shardCount,
			getStoreMap: (index: number) => shards[index],
			get: (key: string) => shardOf(key).get(key),
			set: (key: string, value: unknown) => shardOf(key).set(key, value),
			delete: (key: string) => shardOf(key).delete(key),
			clear: () => {
				for (const shard of shards) {
					shard.clear();
				}
			},
			has: (key: string) => shardOf(key).has(key),
		};
	}

	test("clearExpired() deletes only expired entries and returns how many", async () => {
		const store = new Map();
		const adapter = new KeyvMemoryAdapter(store);
		const now = Date.now();
		await adapter.set("expired-1", "a", now - 1000);
		await adapter.set("expired-2", "b", now - 1);
		await adapter.set("live", "c", now + 60_000);
		await adapter.set("forever", "d");
		// Values the adapter didn't write are left alone
		store.set("raw", "not a memory entry");
		store.set("null", null);

		expect(await adapter.clearExpired()).toBe(2);
		expect([...store.keys()].sort()).toEqual(["forever", "live", "null", "raw"]);
		expect(await adapter.clearExpired()).toBe(0);
	});

	test("clearExpired() only deletes the current namespace's expired entries", async () => {
		const store = new Map();
		const past = Date.now() - 1000;
		const ns1 = new KeyvMemoryAdapter(store, { namespace: "ns1" });
		const ns2 = new KeyvMemoryAdapter(store, { namespace: "ns2" });
		await ns1.set("key", "v1", past);
		await ns2.set("key", "v2", past);
		store.set(42, { value: "non-string key", expires: past });

		expect(await ns1.clearExpired()).toBe(1);
		expect(store.has("ns1::key")).toBe(false);
		expect(store.has("ns2::key")).toBe(true);
		expect(store.has(42)).toBe(true);

		// An adapter without a namespace sweeps every namespace
		expect(await new KeyvMemoryAdapter(store).clearExpired()).toBe(2);
		expect(store.size).toBe(0);
	});

	test("does nothing for a store without entries()", async () => {
		vi.useFakeTimers();
		const customStore = {
			get: () => undefined,
			set: () => {},
			delete: () => true,
			clear: () => {},
			has: () => false,
		};
		const adapter = new KeyvMemoryAdapter(customStore, { clearExpiredInterval: 100 });
		const onError = vi.fn();
		adapter.on("error", onError);

		expect(await adapter.clearExpired()).toBe(0);
		vi.advanceTimersByTime(300);
		expect(onError).not.toHaveBeenCalled();
		await adapter.disconnect();
	});

	test("is off by default", () => {
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const adapter = new KeyvMemoryAdapter(new Map());
		expect(adapter.clearExpiredInterval).toBe(0);
		expect(setIntervalSpy).not.toHaveBeenCalled();
	});

	test("deletes expired entries on the timer without a read", async () => {
		vi.useFakeTimers();
		const store = new Map();
		const adapter = new KeyvMemoryAdapter(store, { clearExpiredInterval: 1000 });
		expect(adapter.clearExpiredInterval).toBe(1000);
		await adapter.set("short", "a", Date.now() + 500);
		await adapter.set("long", "b", Date.now() + 5000);

		vi.advanceTimersByTime(999);
		expect(store.size).toBe(2);
		vi.advanceTimersByTime(1);
		expect(store.has("short")).toBe(false);
		expect(store.has("long")).toBe(true);
		vi.advanceTimersByTime(5000);
		expect(store.size).toBe(0);
		await adapter.disconnect();
	});

	test("the setter restarts the timer, and 0, NaN, or a negative value stops it", async () => {
		vi.useFakeTimers();
		const store = new Map();
		const adapter = new KeyvMemoryAdapter(store, { clearExpiredInterval: 10_000 });
		adapter.clearExpiredInterval = 100;
		expect(adapter.clearExpiredInterval).toBe(100);
		expect(vi.getTimerCount()).toBe(1);
		await adapter.set("key", "value", Date.now() + 50);
		vi.advanceTimersByTime(100);
		expect(store.size).toBe(0);

		for (const value of [0, Number.NaN, -1]) {
			adapter.clearExpiredInterval = 100;
			adapter.clearExpiredInterval = value;
			expect(adapter.clearExpiredInterval).toBe(value);
			expect(vi.getTimerCount()).toBe(0);
			await adapter.set("key", "value", Date.now() - 1);
			vi.advanceTimersByTime(1000);
			expect(store.has("key")).toBe(true);
			store.clear();
		}
	});

	test("runs an interval longer than Node's timer limit at the limit", () => {
		vi.useFakeTimers();
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const adapter = new KeyvMemoryAdapter(new Map());
		adapter.clearExpiredInterval = 30 * 24 * 60 * 60 * 1000;
		expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 2_147_483_647);
		adapter.clearExpiredInterval = Number.POSITIVE_INFINITY;
		expect(setIntervalSpy).toHaveBeenLastCalledWith(expect.any(Function), 2_147_483_647);
		expect(vi.getTimerCount()).toBe(1);
		adapter.clearExpiredInterval = 0;
	});

	test("disconnect() stops the timer, also through Keyv", async () => {
		vi.useFakeTimers();
		const adapter = new KeyvMemoryAdapter(new Map(), { clearExpiredInterval: 100 });
		expect(vi.getTimerCount()).toBe(1);
		await adapter.disconnect();
		expect(vi.getTimerCount()).toBe(0);

		const keyv = new Keyv({
			store: new KeyvMemoryAdapter(new Map(), { clearExpiredInterval: 100 }),
		});
		expect(vi.getTimerCount()).toBe(1);
		await keyv.disconnect();
		expect(vi.getTimerCount()).toBe(0);
	});

	test("works when setInterval returns a number without unref(), as in browsers", async () => {
		let tick = () => {};
		vi.spyOn(globalThis, "setInterval").mockImplementation(((handler: () => void) => {
			tick = handler;
			return 1;
		}) as unknown as typeof setInterval);
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
		const store = new Map();
		const adapter = new KeyvMemoryAdapter(store, { clearExpiredInterval: 100 });
		await adapter.set("key", "value", Date.now() - 1);

		tick();
		expect(store.size).toBe(0);
		await adapter.disconnect();
		expect(clearIntervalSpy).toHaveBeenCalledWith(1);
	});

	test("sweeps one internal Map of a sharded store per tick, in turn", async () => {
		vi.useFakeTimers();
		const store = createShardedStore(3);
		const adapter = new KeyvMemoryAdapter(store, { clearExpiredInterval: 100 });
		const addExpired = async (...keys: string[]) => {
			for (const key of keys) {
				await adapter.set(key, "value", Date.now() - 1);
			}
		};
		const sizes = () => store.shards.map((shard) => shard.size);

		await addExpired("0:a", "1:a", "2:a");
		vi.advanceTimersByTime(100);
		expect(sizes()).toEqual([0, 1, 1]);
		vi.advanceTimersByTime(100);
		expect(sizes()).toEqual([0, 0, 1]);
		vi.advanceTimersByTime(100);
		expect(sizes()).toEqual([0, 0, 0]);

		// After the last shard it starts over at the first
		await addExpired("0:b", "1:b", "2:b");
		vi.advanceTimersByTime(100);
		expect(sizes()).toEqual([0, 1, 1]);

		// The next shard would be 1; when the store shrinks below that, it starts over at 0
		await addExpired("0:c");
		store.storeSize = 1;
		vi.advanceTimersByTime(100);
		expect(sizes()).toEqual([0, 1, 1]);

		// clearExpired() sweeps every shard at once
		store.storeSize = 3;
		expect(await adapter.clearExpired()).toBe(2);
		expect(sizes()).toEqual([0, 0, 0]);
		await adapter.disconnect();
	});

	test("a sweep that throws emits error and never throws out of the timer", async () => {
		vi.useFakeTimers();
		const error = new Error("entries failed");
		const store = new Map();
		vi.spyOn(store, "entries").mockImplementation(() => {
			throw error;
		});

		// With a listener, the error reaches it
		const adapter = new KeyvMemoryAdapter(store, { clearExpiredInterval: 100 });
		const onError = vi.fn();
		adapter.on("error", onError);
		vi.advanceTimersByTime(100);
		expect(onError).toHaveBeenCalledWith(error);
		await adapter.disconnect();

		// With no listener on the adapter
		const bare = new KeyvMemoryAdapter(store, { clearExpiredInterval: 100 });
		expect(() => vi.advanceTimersByTime(100)).not.toThrow();
		await bare.disconnect();

		// Inside a Keyv with no error listener, which re-emits the adapter's errors
		const keyv = new Keyv({ store: new KeyvMemoryAdapter(store, { clearExpiredInterval: 100 }) });
		expect(() => vi.advanceTimersByTime(100)).not.toThrow();
		await keyv.disconnect();
	});

	test("a replaced adapter keeps sweeping its own store until it is disconnected", async () => {
		vi.useFakeTimers();
		const oldStore = new Map();
		const oldAdapter = new KeyvMemoryAdapter(oldStore, { clearExpiredInterval: 100 });
		const keyv = new Keyv({ store: oldAdapter });
		await keyv.set("key", "value", 50);
		keyv.store = new Map();

		vi.advanceTimersByTime(100);
		expect(oldStore.size).toBe(0);
		expect(vi.getTimerCount()).toBe(1);
		await oldAdapter.disconnect();
		expect(vi.getTimerCount()).toBe(0);
	});

	test("createKeyv passes clearExpiredInterval to the adapter, scoped to the namespace", async () => {
		vi.useFakeTimers();
		const store = new Map();
		const keyv = createKeyv(store, { namespace: "ns", clearExpiredInterval: 100 });
		expect((keyv.store as KeyvMemoryAdapter).clearExpiredInterval).toBe(100);
		await keyv.set("key", "value", 50);
		store.set("other::key", { value: "other", expires: Date.now() - 1 });

		vi.advanceTimersByTime(100);
		expect(store.has("ns::key")).toBe(false);
		expect(store.has("other::key")).toBe(true);
		await keyv.disconnect();
	});
});
