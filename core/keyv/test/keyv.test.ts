import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Keyv, { KeyvMemoryAdapter, KeyvSanitize } from "../src/index.js";
import { KeyvStats } from "../src/stats.js";
import { createMockCompression, createStore, delay } from "./test-utils.js";

describe("constructor", () => {
	test("Keyv is a class", () => {
		expect(typeof Keyv).toBe("function");
		// @ts-expect-error
		expect(() => Keyv()).toThrow(); // eslint-disable-line new-cap
		expect(() => new Keyv()).not.toThrow();
	});

	test("should be able to create a new instance", () => {
		const keyv = new Keyv();
		expect(keyv).toBeDefined();
	});

	test("should be able to create a new instance with a store", () => {
		const keyv = new Keyv(new Map());
		expect(keyv).toBeDefined();
	});

	test("when setting store property with undefined it should default to KeyvMemoryAdapter", () => {
		const store = undefined;
		const keyv = new Keyv({ store });
		expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);
	});

	test("accepts storage adapters as options object", async () => {
		const store = new Map();
		const keyv = new Keyv<string>({ store });
		expect(store.size).toBe(0);
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		expect(store.size).toBe(1);
	});

	test("accepts storage adapters and options", async () => {
		const store = new Map();
		const keyv = new Keyv(store, { namespace: "test" });
		expect(store.size).toBe(0);
		await keyv.set("foo", "bar");
		expect(keyv.namespace).toBe("test");
	});

	test("accepts storage adapters instead of options", async () => {
		const store = new Map();
		const keyv = new Keyv<string>(store);
		expect(store.size).toBe(0);
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		expect(store.size).toBe(1);
	});

	test("allows get and set the store via property", async () => {
		const store = new Map();
		const keyv = new Keyv<string>();
		keyv.store = store;
		expect(store.size).toBe(0);
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		expect(store.size).toBe(1);
		expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);
	});

	test("should throw if invalid storage or Map on store property", async () => {
		const store = new Map();
		const keyv = new Keyv<string>();
		keyv.store = store;
		expect(store.size).toBe(0);
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		expect(store.size).toBe(1);
		expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);

		expect(() => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			keyv.store = { get() {}, set() {}, delete() {} };
		}).toThrow();
	});

	test("should trigger an error when store is invalid", () => {
		const store = new Map();

		expect(
			() =>
				new Keyv({
					store: {
						async get(key: string) {
							store.get(key);
						},
					},
				}),
		).toThrow();
	});
});

describe("store", () => {
	test("should be able to set the store via property", () => {
		const store = createStore();
		const keyv = new Keyv();
		keyv.store = store;
		expect(keyv.store).toBeDefined();
	});

	test("should be able to set the namespace via property", () => {
		const store = createStore();
		const keyv = new Keyv({ store });
		expect(keyv.namespace).toBeUndefined();
		keyv.namespace = "test";
		expect(keyv.namespace).toBe("test");
		expect(keyv.store.namespace).toBe("test");
	});
});

describe("namespace", () => {
	test("will not prefix if there is no namespace", async () => {
		const keyv = new Keyv();
		expect(keyv.namespace).toBeUndefined();
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.set("foo2", "bar2");
		expect(await keyv.get("foo")).toBe("bar");
		const values = (await keyv.get<string>(["foo", "foo1", "foo2"])) as string[];
		expect(values).toStrictEqual(["bar", "bar1", "bar2"]);
	});
});

describe("serialization", () => {
	test("uses custom serializer when provided instead of default", async () => {
		expect.assertions(3);
		const store = new Map();
		const serialization = {
			stringify(data: unknown) {
				expect(true).toBeTruthy();
				return JSON.stringify(data);
			},
			parse<T>(data: string) {
				expect(true).toBeTruthy();
				return JSON.parse(data) as T;
			},
		};

		const keyv = new Keyv({ store, serialization });
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
	});

	test("supports async serializer/deserializer", async () => {
		expect.assertions(3);
		const serialization = {
			async stringify(data: unknown) {
				expect(true).toBeTruthy();
				return JSON.stringify(data);
			},
			async parse<T>(data: string) {
				expect(true).toBeTruthy();
				return JSON.parse(data) as T;
			},
		};

		const keyv = new Keyv({ serialization });
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
	});

	test("does get and set on serialization property", async () => {
		const serialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};
		const keyv = new Keyv({
			store: new Map(),
			serialization,
		});
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");

		const newSerialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};
		keyv.serialization = newSerialization;
		expect(keyv.serialization).toBe(newSerialization);
	});

	test("serialization setter with false clears the adapter", () => {
		const keyv = new Keyv();
		expect(keyv.serialization).toBeDefined();
		keyv.serialization = false;
		expect(keyv.serialization).toBeUndefined();
	});

	test("will not serialize / deserialize / compress if serialization is undefined", async () => {
		const keyv = new Keyv({ compression: createMockCompression() });
		keyv.serialization = undefined;
		const complexObject = { foo: "bar", fizz: "buzz" };
		await keyv.set("foo-complex", complexObject);
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		expect(await keyv.get("foo-complex")).toStrictEqual(complexObject);
	});

	test("serializeData uses JSON.stringify when compression is set without serialization", async () => {
		const keyv = new Keyv({
			serialization: false,
			compression: createMockCompression(),
		});
		const data = { value: "hello", expires: undefined };
		const result = await keyv.serializeData(data);
		expect(result).toBe(JSON.stringify(data));
	});

	test("deserializeData will return the data object if not string", async () => {
		const keyv = new Keyv();
		const complexObject = { foo: "bar", fizz: "buzz" };
		const result = await keyv.deserializeData({ value: complexObject });
		expect(result).toStrictEqual({ value: complexObject });
	});

	test("deserializeData returns undefined for null/undefined input", async () => {
		const keyv = new Keyv();
		// biome-ignore lint/suspicious/noExplicitAny: test
		expect(await keyv.deserializeData(undefined as any)).toBeUndefined();
		// biome-ignore lint/suspicious/noExplicitAny: test
		expect(await keyv.deserializeData(null as any)).toBeUndefined();
	});

	test("deserializeData with no serialization and no compression returns raw object", async () => {
		const keyv = new Keyv({ serialization: false });
		const data = { value: "hello", expires: undefined };
		const result = await keyv.deserializeData(data);
		expect(result).toStrictEqual(data);
	});

	test("deserializeData with no serialization and no compression returns undefined for string", async () => {
		const keyv = new Keyv({ serialization: false });
		const result = await keyv.deserializeData("some-string");
		expect(result).toBeUndefined();
	});

	test("deserializeData returns undefined when decompressed string is invalid JSON", async () => {
		const keyv = new Keyv({
			serialization: false,
			compression: {
				async compress(value: unknown) {
					return value;
				},
				async decompress(_value: unknown) {
					return "not-valid-json{{{";
				},
			},
		});
		const result = await keyv.deserializeData("anything");
		expect(result).toBeUndefined();
	});
});

describe("compression", () => {
	test("pass compress options", async () => {
		const keyv = new Keyv({
			store: new Map(),
			compression: createMockCompression(),
		});
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
	});

	test("can get and set the compress property", () => {
		const keyv = new Keyv();
		const compression = createMockCompression();
		expect(keyv.compression).not.toBeDefined();
		keyv.compression = compression;
		expect(keyv.compression).toBe(compression);
	});
});

describe("delete", () => {
	test("should delete multiple keys for storage adapter not supporting deleteMany", async () => {
		const keyv = new Keyv({ store: new Map() });
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.set("foo2", "bar2");
		expect(await keyv.delete(["foo", "foo1", "foo2"])).toBeTruthy();
		expect(await keyv.get("foo")).toBeUndefined();
		expect(await keyv.get("foo1")).toBeUndefined();
		expect(await keyv.get("foo2")).toBeUndefined();
	});

	test("with nonexistent keys resolves to array of false for storage adapter not supporting deleteMany", async () => {
		const keyv = new Keyv({ store: new Map() });
		expect(await keyv.delete(["foo", "foo1", "foo2"])).toEqual([false, false, false]);
	});

	test("should handle error on store delete", async () => {
		const store = new Map();
		store.delete = vi.fn().mockRejectedValue(new Error("store delete error"));
		const keyv = new Keyv(store);
		const errorHandler = vi.fn();
		keyv.on("error", errorHandler);
		const result = await keyv.delete("foo55");
		expect(result).toBe(false);
		expect(errorHandler).toHaveBeenCalledWith(new Error("store delete error"));
	});
});

describe("has", () => {
	test("should return if adapter does not support has", async () => {
		const keyv = new Keyv();
		await keyv.set("foo", "bar");
		expect(await keyv.has("foo")).toBe(true);
		expect(await keyv.has("fizz")).toBe(false);
	});

	test("should return if Map and undefined expires", async () => {
		const keyv = new Keyv();
		await keyv.set("foo", "bar");
		expect(await keyv.has("foo")).toBe(true);
		expect(await keyv.has("fizz")).toBe(false);
	});

	test("should return if adapter does not support has on expired", async () => {
		const keyv = new Keyv({ store: new Map() });
		await keyv.set("foo", "bar", 1000);
		expect(await keyv.has("foo")).toBe(true);
		await delay(1100);
		expect(await keyv.has("foo")).toBe(false);
	});

	test("should return false on expired", async () => {
		const keyv = new Keyv({ store: new Map() });
		const keyName = "expired-key";
		await keyv.set(keyName, "bar", 1000);
		await delay(1100);
		const value = await keyv.get(keyName);
		const exists = await keyv.has(keyName);
		expect(value).toBeUndefined();
		expect(exists).toBe(false);
	});

	test("should return true or false on Map", async () => {
		const keyv = new Keyv({ store: new Map() });
		await keyv.set("foo", "bar", 1000);
		expect(await keyv.has("foo")).toBe(true);
		await delay(1100);
		expect(await keyv.has("foo")).toBe(false);
	});

	test("should delegate to store.has when store is not KeyvMemoryAdapter", async () => {
		const store = createStore();
		const keyv = new Keyv({ store });
		await keyv.set("foo", "bar");
		expect(await keyv.has("foo")).toBe(true);
		expect(await keyv.has("nonexistent")).toBe(false);
	});

	test("should handle error on store has / get", async () => {
		const keyv = new Keyv({ store: new Map() });
		// Override the adapter's has to simulate a store error
		keyv.store.has = vi.fn().mockRejectedValue(new Error("store has error"));
		const errorHandler = vi.fn();
		keyv.on("error", errorHandler);
		const result = await keyv.has("foo");
		expect(result).toBe(false);
	});
});

describe("clear", () => {
	test("should handle error on store clear", async () => {
		const adapter = new KeyvMemoryAdapter(new Map());
		const keyv = new Keyv({ store: adapter });
		keyv.store.clear = vi.fn().mockRejectedValue(new Error("store clear error"));
		const errorHandler = vi.fn();
		keyv.on("error", errorHandler);
		await keyv.clear();
		expect(errorHandler).toHaveBeenCalledWith(new Error("store clear error"));
	});

	test("emit clear event", async () => {
		const keyv = new Keyv();
		keyv.on("clear", () => {
			expect(true).toBeTruthy();
		});
		await keyv.clear();
	});
});

describe("disconnect", () => {
	test("close connection successfully", async () => {
		const keyv = new Keyv({ store: createStore() });
		await keyv.clear();
		expect(await keyv.get("foo")).toBeUndefined();
		await keyv.set("foo", "bar");
		expect(await keyv.disconnect()).toBeUndefined();
	});

	test("close connection undefined", async () => {
		const store = new Map();
		const keyv = new Keyv({ store });
		expect(await keyv.disconnect()).toBeUndefined();
	});

	test("emit disconnect event", async () => {
		const keyv = new Keyv();
		keyv.on("disconnect", () => {
			expect(true).toBeTruthy();
		});
		await keyv.disconnect();
	});
});

describe("stats", () => {
	test("opts.stats should set the stats manager", () => {
		const keyv = new Keyv({ stats: true });
		expect(keyv.stats.enabled).toBe(true);
	});

	test("stats setter should replace the stats manager", () => {
		const keyv = new Keyv({ stats: true });
		const newStats = new KeyvStats({ enabled: true });
		keyv.stats = newStats;
		expect(keyv.stats).toBe(newStats);
	});

	test("stats enabled should create counts", async () => {
		const keyv = new Keyv({ stats: true });
		await keyv.set("foo", "bar");
		await keyv.get("foo");
		await keyv.get("foo1");
		await keyv.delete("foo");
		expect(keyv.stats.hits).toBe(1);
		expect(keyv.stats.misses).toBe(1);
		expect(keyv.stats.deletes).toBe(1);
		expect(keyv.stats.sets).toBe(1);
	});
});

describe("iterator", () => {
	test("should exist with store adapter", () => {
		const keyv = new Keyv({
			store: createStore(),
		});
		expect(typeof keyv.iterator).toBe("function");
	});

	test("doesn't yield values from other namespaces", async () => {
		const keyvStore = new Map();

		const keyv1 = new Keyv({ store: keyvStore, namespace: "keyv1" });
		const map1 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({ store: keyvStore, namespace: "keyv2" });
		const map2 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	});

	test("doesn't yield values from other namespaces with compression", async () => {
		const keyvStore = new Map();
		const keyv1 = new Keyv({
			store: keyvStore,
			namespace: "keyv1",
			compression: createMockCompression(),
		});
		const map1 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);
		const keyv2 = new Keyv({
			store: keyvStore,
			namespace: "keyv2",
			compression: createMockCompression(),
		});
		const map2 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 11)]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	});

	test("doesn't yield values from other namespaces with custom serializer/deserializer", async () => {
		const keyvStore = new Map();

		const serialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};

		const keyv1 = new Keyv({
			store: keyvStore,
			serialization,
			namespace: "keyv1",
		});
		const map1 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({
			store: keyvStore,
			serialization,
			namespace: "keyv2",
		});
		const map2 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	});

	test("doesn't yield values from other namespaces with custom serializer/deserializer and compression", async () => {
		const keyvStore = new Map();

		const serialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};

		const keyv1 = new Keyv({
			store: keyvStore,
			serialization,
			namespace: "keyv1",
			compression: createMockCompression(),
		});
		const map1 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({
			store: keyvStore,
			serialization,
			namespace: "keyv2",
		});
		const map2 = new Map(
			Array.from({ length: 5 })
				.fill(0)
				.map((_x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	});

	test("should detect iterable adapter when store has iterator method", () => {
		const map = new Map<string, unknown>();
		const store = {
			opts: { url: "redis://localhost:6379" },
			async get(key: string) {
				return map.get(key);
			},
			async set(key: string, value: unknown) {
				map.set(key, value);
			},
			async delete(key: string) {
				return map.delete(key);
			},
			async clear() {
				map.clear();
			},
			async *iterator(namespace?: string) {
				for (const [key, value] of map) {
					if (!namespace || key.startsWith(namespace)) {
						yield [key, value];
					}
				}
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const keyv = new Keyv(store as any);
		expect(keyv.iterator).toBeDefined();
	});

	test("store without iterator support yields no entries", async () => {
		const store = {
			namespace: undefined as string | undefined,
			async get(_key: string) {
				return undefined;
			},
			async set(_key: string, _value: unknown) {},
			async delete(_key: string) {
				return true;
			},
			async clear() {},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const keyv = new Keyv(store as any);
		expect(typeof keyv.iterator).toBe("function");

		// Consume the iterator — store is wrapped in KeyvBridgeAdapter which
		// returns an empty generator when the underlying store lacks iterator
		const entries: unknown[] = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry);
		}

		expect(entries.length).toBe(0);
	});

	test("store set via setter without iterator support yields no entries", async () => {
		const keyv = new Keyv();
		const store = {
			namespace: undefined as string | undefined,
			async get(_key: string) {
				return undefined;
			},
			async set(_key: string, _value: unknown) {},
			async delete(_key: string) {
				return true;
			},
			async clear() {},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		keyv.store = store as any;
		expect(typeof keyv.iterator).toBe("function");

		const entries: unknown[] = [];
		for await (const _entry of keyv.iterator()) {
			entries.push(_entry);
		}

		expect(entries.length).toBe(0);
	});

	test("works with store that has an iterator method", async () => {
		const map = new Map<string, string>();
		const store = {
			namespace: undefined as string | undefined,
			async get(key: string) {
				return map.get(key);
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			async set(key: string, value: any) {
				map.set(key, value);
				return true;
			},
			async delete(key: string) {
				return map.delete(key);
			},
			async clear() {
				map.clear();
			},
			async *iterator() {
				for (const [key, value] of map) {
					yield [key, value];
				}
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const keyv = new Keyv(store as any);
		await keyv.set("key1", "value1");
		await keyv.set("key2", "value2");

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		expect(entries.length).toBe(2);
	});

	test("deletes expired entries from store with iterator method", async () => {
		const map = new Map<string, string>();
		const store = {
			namespace: undefined as string | undefined,
			async get(key: string) {
				return map.get(key);
			},
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			async set(key: string, value: any) {
				map.set(key, value);
				return true;
			},
			async delete(key: string) {
				return map.delete(key);
			},
			async clear() {
				map.clear();
			},
			async *iterator() {
				for (const [key, value] of map) {
					yield [key, value];
				}
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const keyv = new Keyv(store as any);
		await keyv.set("fresh", "value1");
		await keyv.set("expired", "value2", 1);
		await delay(10);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}

		// Only the fresh entry should be yielded; expired should be deleted
		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe("fresh");
		expect(await keyv.has("expired")).toBe(false);
	});

	test("should not increment deletes stat indefinitely", async () => {
		vi.useFakeTimers();

		try {
			const keyv = new Keyv({
				stats: true,
			});

			// Set an item that will expire in 100ms
			const result = await keyv.set("foo", "bar", 100);
			expect(result).toBe(true);
			expect(keyv.stats.deletes).toBe(0);

			// Now the item is expired
			vi.advanceTimersByTime(101);

			// No gets yet, so no deletes
			expect(keyv.stats.deletes).toBe(0);

			let iterationCount = 0;
			// Get all items using iterator
			for await (const _ of keyv.iterator() ?? []) {
				// All items are expired, it doesn't enter the loop
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(1);

			iterationCount = 0;
			// Get all items using iterator
			for await (const _ of keyv.iterator() ?? []) {
				// All items are expired, it doesn't enter the loop
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("throwErrors", () => {
	type TestData = {
		key: string;
		value: string;
	};

	let testData: TestData[] = [];
	let testKeys: string[] = [];

	const throwingStore = new Map();
	throwingStore.get = () => {
		throw new Error("Test error");
	};

	throwingStore.set = () => {
		throw new Error("Test error");
	};

	throwingStore.delete = () => {
		throw new Error("Test error");
	};

	throwingStore.clear = () => {
		throw new Error("Test error");
	};

	throwingStore.has = () => {
		throw new Error("Test error");
	};

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}

		testKeys = testData.map((data) => data.key);
	});

	test("should get the current throwOnErrors value", () => {
		const keyv = new Keyv(throwingStore);
		expect(keyv.throwOnErrors).toBe(false);
	});

	test("should set the throwOnErrors value", () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		expect(keyv.throwOnErrors).toBe(true);
	});

	test("should pass in the throwOnErrors option", () => {
		const keyv = new Keyv({ store: throwingStore, throwOnErrors: true });
		expect(keyv.throwOnErrors).toBe(true);
	});

	test("should throw when setting a value", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.set("key", "value")).rejects.toThrow("Test error");
	});

	test("should not throw when setting a value with throwOnErrors set to false", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = false;
		keyv.on("error", () => {});
		const result = await keyv.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
		expect(result).toBe(false);
	});

	test("should throw when getting a value", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.get("key")).rejects.toThrow("Test error");
	});

	test("should not throw when getting a value with throwOnErrors set to false", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = false;
		keyv.on("error", () => {});
		const result = await keyv.get(faker.string.alphanumeric(10));
		expect(result).toBeUndefined();
	});

	test("should throw when deleting a value", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.delete("key")).rejects.toThrow("Test error");
	});

	test("should not throw when deleting a value with throwOnErrors set to false", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = false;
		keyv.on("error", () => {});
		const result = await keyv.delete(faker.string.alphanumeric(10));
		expect(result).toBe(false);
	});

	test("should throw when clearing the store", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.clear()).rejects.toThrow("Test error");
	});

	test("should not throw when clearing the store with throwOnErrors set to false", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = false;
		keyv.on("error", () => {});
		const result = await keyv.clear();
		expect(result).toBeUndefined();
	});

	test("should throw when checking if a key exists", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.has("key")).rejects.toThrow("Test error");
	});

	test("should not throw when checking if a key exists with throwOnErrors set to false", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = false;
		keyv.on("error", () => {});
		const result = await keyv.has(faker.string.alphanumeric(10));
		expect(result).toBe(false);
	});

	test("should throw when deleting multiple keys", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.deleteMany(testKeys)).rejects.toThrow("Test error");
	});

	test("should throw when setting multiple keys", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.setMany(testData)).rejects.toThrow("Test error");
	});
});

describe("sanitize", () => {
	test("should not sanitize keys by default", async () => {
		const keyv = new Keyv();
		await keyv.set("test'; DROP TABLE", "value");
		expect(await keyv.get("test'; DROP TABLE")).toBe("value");
	});

	test("should sanitize keys when explicitly enabled", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("test; DROP TABLE", "value");
		expect(await keyv.get("test DROP TABLE")).toBe("value");
	});

	test("should not sanitize keys when disabled", async () => {
		const keyv = new Keyv();
		await keyv.set("test'; DROP TABLE", "value");
		expect(await keyv.get("test'; DROP TABLE")).toBe("value");
	});

	test("should support granular category control on keys", async () => {
		const keyv = new Keyv({ sanitize: { keys: { sql: true, mongo: false } } });
		await keyv.set("$key;test", "value");
		expect(await keyv.get("$keytest")).toBe("value");
	});

	test("should sanitize keys in getMany", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("clean-key", "value1");
		const result = await keyv.getMany(["clean-key", "miss;key"]);
		expect(result[0]).toBe("value1");
		expect(result[1]).toBeUndefined();
	});

	test("should sanitize keys in has", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("test-key", "value");
		expect(await keyv.has("test-key")).toBe(true);
		expect(await keyv.has("test'-key")).toBe(false);
	});

	test("should sanitize keys in delete", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("testkey", "value");
		await keyv.delete("test;key");
		expect(await keyv.has("testkey")).toBe(false);
	});

	test("should sanitize keys in setMany", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.setMany([
			{ key: "key;1", value: "value1" },
			{ key: "key--2", value: "value2" },
		]);
		expect(await keyv.get("key1")).toBe("value1");
		expect(await keyv.get("key2")).toBe("value2");
	});

	test("getter and setter should work", () => {
		const keyv = new Keyv();
		expect(keyv.sanitize).toBeInstanceOf(KeyvSanitize);
		expect(keyv.sanitize.enabled).toBe(false);

		(keyv.sanitize as KeyvSanitize).updateOptions({ keys: true, namespace: true });
		expect(keyv.sanitize.enabled).toBe(true);

		(keyv.sanitize as KeyvSanitize).updateOptions({ keys: { sql: true, mongo: false } });
		expect(keyv.sanitize.keys.sql).toBe(true);
		expect(keyv.sanitize.keys.mongo).toBe(false);

		keyv.sanitize = new KeyvSanitize();
		expect(keyv.sanitize.enabled).toBe(false);
	});

	test("setter with updateOptions should enable all sanitization categories", async () => {
		const keyv = new Keyv();
		(keyv.sanitize as KeyvSanitize).updateOptions({ keys: true, namespace: true });
		await keyv.set("test;../key\0val", "value");
		expect(await keyv.get("testkeyval")).toBe("value");
	});

	test("setter with options object should apply granular sanitization", async () => {
		const keyv = new Keyv();
		(keyv.sanitize as KeyvSanitize).updateOptions({
			keys: { sql: true, mongo: false, path: false },
		});
		await keyv.set("test;$key/../path", "value");
		expect(await keyv.get("test$key/../path")).toBe("value");
	});

	test("harmless characters pass through when sanitization is enabled", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("user's-data", "value");
		expect(await keyv.get("user's-data")).toBe("value");
	});

	test("should sanitize namespace at construction", () => {
		const keyv = new Keyv({ namespace: "ns;evil", sanitize: { keys: true, namespace: true } });
		expect(keyv.namespace).toBe("nsevil");
	});

	test("should sanitize namespace on setter", () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		keyv.namespace = "ns;evil";
		expect(keyv.namespace).toBe("nsevil");
	});

	test("should not sanitize namespace when namespace is false", () => {
		const keyv = new Keyv({ namespace: "ns;evil", sanitize: { namespace: false } });
		expect(keyv.namespace).toBe("ns;evil");
	});

	test("should support independent patterns for keys and namespace", async () => {
		const keyv = new Keyv({
			namespace: "ns;../test",
			sanitize: {
				keys: { sql: true, path: false },
				namespace: { sql: false, path: true },
			},
		});
		// Namespace: path stripped, sql preserved
		expect(keyv.namespace).toBe("ns;test");
		// Keys: sql stripped, path preserved
		await keyv.set("key;../value", "data");
		expect(await keyv.get("key../value")).toBe("data");
	});

	test("empty key after sanitization is gracefully rejected", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		// ";" is stripped to "" (semicolon is a dangerous SQL pattern)
		expect(await keyv.set(";", "value")).toBe(false);
		expect(await keyv.get(";")).toBeUndefined();
		expect(await keyv.getRaw(";")).toBeUndefined();
		expect(await keyv.setRaw(";", { value: "value", expires: undefined })).toBe(false);
		expect(await keyv.delete(";")).toBe(false);
		expect(await keyv.has(";")).toBe(false);
	});
});
