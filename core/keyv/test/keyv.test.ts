import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Keyv, { KeyvMemoryAdapter, KeyvSanitize } from "../src/index.js";
import { KeyvStats } from "../src/stats.js";
import { createMockCompression, createStore, delay } from "./test-utils.js";

describe("constructor", () => {
	test("Keyv is a class that can be instantiated with or without a store", () => {
		expect(typeof Keyv).toBe("function");
		// @ts-expect-error
		expect(() => Keyv()).toThrow(); // eslint-disable-line new-cap
		expect(() => new Keyv()).not.toThrow();
		expect(new Keyv()).toBeDefined();
		expect(new Keyv(new Map())).toBeDefined();
	});

	test("when setting store property with undefined it should default to KeyvMemoryAdapter", () => {
		const store = undefined;
		const keyv = new Keyv({ store });
		expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);
	});

	test("accepts storage adapters via options, as first arg, or with additional options", async () => {
		const store1 = new Map();
		const keyv1 = new Keyv<string>({ store: store1 });
		await keyv1.set("foo", "bar");
		expect(await keyv1.get("foo")).toBe("bar");
		expect(store1.size).toBe(1);

		const store2 = new Map();
		const keyv2 = new Keyv<string>(store2);
		await keyv2.set("foo", "bar");
		expect(await keyv2.get("foo")).toBe("bar");

		const store3 = new Map();
		const keyv3 = new Keyv(store3, { namespace: "test" });
		await keyv3.set("foo", "bar");
		expect(keyv3.namespace).toBe("test");
	});

	test("allows get and set the store via property", async () => {
		const store = new Map();
		const keyv = new Keyv<string>();
		keyv.store = store;
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);
	});

	test("should throw if invalid storage on store property or constructor", async () => {
		const keyv = new Keyv<string>();
		keyv.store = new Map();
		await keyv.set("foo", "bar");
		expect(() => {
			// eslint-disable-next-line @typescript-eslint/no-empty-function
			keyv.store = { get() {}, set() {}, delete() {} };
		}).toThrow();

		expect(
			() =>
				new Keyv({
					store: {
						async get(key: string) {
							new Map().get(key);
						},
					},
				}),
		).toThrow();
	});

	test("should treat non-positive ttl as undefined", () => {
		const keyv1 = new Keyv();
		keyv1.setTtl(-100);
		expect(keyv1.ttl).toBeUndefined();

		expect(new Keyv({ ttl: -500 }).ttl).toBeUndefined();

		const keyv2 = new Keyv();
		keyv2.setTtl(0);
		expect(keyv2.ttl).toBeUndefined();

		expect(new Keyv({ ttl: 0 }).ttl).toBeUndefined();
	});
});

describe("store", () => {
	test("should be able to set the store and namespace via property", () => {
		const store = createStore();
		const keyv = new Keyv({ store });
		expect(keyv.store).toBeDefined();
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

	test("serialization property getter/setter and disable behavior", async () => {
		// Get/set serialization property
		const serialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};
		const keyv = new Keyv({ store: new Map(), serialization });
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
		const newSerialization = {
			stringify: (data: unknown) => JSON.stringify(data),
			parse: <T>(data: string) => JSON.parse(data) as T,
		};
		keyv.serialization = newSerialization;
		expect(keyv.serialization).toBe(newSerialization);

		// Setting to false clears the adapter
		keyv.serialization = false;
		expect(keyv.serialization).toBeUndefined();

		// Will not serialize/compress if serialization is undefined
		const keyv2 = new Keyv({ compression: createMockCompression() });
		keyv2.serialization = undefined;
		const complexObject = { foo: "bar", fizz: "buzz" };
		await keyv2.set("foo-complex", complexObject);
		await keyv2.set("foo", "bar");
		expect(await keyv2.get("foo")).toBe("bar");
		expect(await keyv2.get("foo-complex")).toStrictEqual(complexObject);
	});

	test("encode returns data as-is when serialization is disabled", async () => {
		const keyv = new Keyv({ serialization: false, compression: createMockCompression() });
		const data = { value: "hello", expires: undefined };
		const result = await keyv.encode(data);
		expect(result).toStrictEqual(data);
	});

	test("decode edge cases", async () => {
		const keyv = new Keyv();
		// Returns object if not string
		const complexObject = { foo: "bar", fizz: "buzz" };
		expect(await keyv.decode({ value: complexObject })).toStrictEqual({ value: complexObject });

		// Returns undefined for null/undefined
		// biome-ignore lint/suspicious/noExplicitAny: test
		expect(await keyv.decode(undefined as any)).toBeUndefined();
		// biome-ignore lint/suspicious/noExplicitAny: test
		expect(await keyv.decode(null as any)).toBeUndefined();

		// No serialization, no compression returns raw object
		const keyv2 = new Keyv({ serialization: false });
		expect(await keyv2.decode({ value: "hello", expires: undefined })).toStrictEqual({
			value: "hello",
			expires: undefined,
		});

		// No serialization, no compression returns undefined for string
		expect(await keyv2.decode("some-string")).toBeUndefined();

		// Returns undefined when decompressed string is invalid JSON
		const keyv3 = new Keyv({
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
		expect(await keyv3.decode("anything")).toBeUndefined();
	});
});

describe("compression", () => {
	test("pass compress options and get/set property", async () => {
		const keyv = new Keyv({ store: new Map(), compression: createMockCompression() });
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");

		const keyv2 = new Keyv();
		const compression = createMockCompression();
		expect(keyv2.compression).not.toBeDefined();
		keyv2.compression = compression;
		expect(keyv2.compression).toBe(compression);
	});
});

describe("encryption", () => {
	test("can get and set the encryption property", () => {
		const keyv = new Keyv();
		expect(keyv.encryption).toBeUndefined();
		const adapter = {
			async encrypt(data: string) {
				return `enc:${data}`;
			},
			async decrypt(data: string) {
				return data.replace("enc:", "");
			},
		};
		keyv.encryption = adapter;
		expect(keyv.encryption).toBe(adapter);
		keyv.encryption = undefined;
		expect(keyv.encryption).toBeUndefined();
	});

	test("encode and decode with encryption", async () => {
		const keyv = new Keyv({
			encryption: {
				async encrypt(data: string) {
					return Buffer.from(data).toString("base64");
				},
				async decrypt(data: string) {
					return Buffer.from(data, "base64").toString("utf8");
				},
			},
		});
		await keyv.set("foo", "bar");
		expect(await keyv.get("foo")).toBe("bar");
	});

	test("encode throws on failure, decode emits error and returns undefined", async () => {
		const keyvEnc = new Keyv({
			encryption: {
				encrypt() {
					throw new Error("encrypt failed");
				},
				async decrypt(data: string) {
					return data;
				},
			},
		});
		await expect(keyvEnc.encode({ value: "hello", expires: undefined })).rejects.toThrow(
			"encrypt failed",
		);

		const keyvDec = new Keyv({
			encryption: {
				async encrypt(data: string) {
					return data;
				},
				decrypt() {
					throw new Error("decrypt failed");
				},
			},
		});
		const errorHandler = vi.fn();
		keyvDec.on("error", errorHandler);
		expect(await keyvDec.decode("some-data")).toBeUndefined();
		expect(errorHandler).toHaveBeenCalled();
	});
});

describe("delete", () => {
	test("should delete multiple keys and handle nonexistent keys", async () => {
		const keyv = new Keyv({ store: new Map() });
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.set("foo2", "bar2");
		expect(await keyv.delete(["foo", "foo1", "foo2"])).toBeTruthy();
		expect(await keyv.get("foo")).toBeUndefined();

		// Nonexistent keys
		expect(await keyv.delete(["foo", "foo1", "foo2"])).toEqual([false, false, false]);
	});

	test("should handle error on store delete", async () => {
		const store = new Map();
		store.delete = vi.fn().mockRejectedValue(new Error("store delete error"));
		const keyv = new Keyv(store);
		const errorHandler = vi.fn();
		keyv.on("error", errorHandler);
		expect(await keyv.delete("foo55")).toBe(false);
		expect(errorHandler).toHaveBeenCalledWith(new Error("store delete error"));
	});
});

describe("has", () => {
	test("should return true/false for existing/missing keys", async () => {
		const keyv = new Keyv();
		await keyv.set("foo", "bar");
		expect(await keyv.has("foo")).toBe(true);
		expect(await keyv.has("fizz")).toBe(false);
	});

	test("should return false for expired keys", async () => {
		const keyv = new Keyv({ store: new Map() });
		await keyv.set("foo", "bar", 1000);
		expect(await keyv.has("foo")).toBe(true);
		await delay(1100);
		expect(await keyv.has("foo")).toBe(false);
		expect(await keyv.get("foo")).toBeUndefined();
	});

	test("should delegate to store.has when store is not KeyvMemoryAdapter", async () => {
		const store = createStore();
		const keyv = new Keyv({ store });
		await keyv.set("foo", "bar");
		expect(await keyv.has("foo")).toBe(true);
		expect(await keyv.has("nonexistent")).toBe(false);
	});

	test("should handle error on store has and hasMany", async () => {
		const keyv = new Keyv({ store: new Map() });
		keyv.store.has = vi.fn().mockRejectedValue(new Error("store has error"));
		const errorHandler = vi.fn();
		keyv.on("error", errorHandler);
		expect(await keyv.has("foo")).toBe(false);

		const keyv2 = new Keyv({ store: new Map() });
		keyv2.store.hasMany = vi.fn().mockRejectedValue(new Error("store hasMany error"));
		const errorHandler2 = vi.fn();
		keyv2.on("error", errorHandler2);
		expect(await keyv2.hasMany(["foo", "bar"])).toEqual([false, false]);
		expect(errorHandler2).toHaveBeenCalledWith(new Error("store hasMany error"));
	});
});

describe("clear", () => {
	test("should handle error on store clear and emit clear event", async () => {
		const adapter = new KeyvMemoryAdapter(new Map());
		const keyv = new Keyv({ store: adapter });
		keyv.store.clear = vi.fn().mockRejectedValue(new Error("store clear error"));
		const errorHandler = vi.fn();
		keyv.on("error", errorHandler);
		await keyv.clear();
		expect(errorHandler).toHaveBeenCalledWith(new Error("store clear error"));

		const keyv2 = new Keyv();
		keyv2.on("clear", () => {
			expect(true).toBeTruthy();
		});
		await keyv2.clear();
	});
});

describe("disconnect", () => {
	test("close connection successfully with various store types", async () => {
		const keyv1 = new Keyv({ store: createStore() });
		await keyv1.set("foo", "bar");
		expect(await keyv1.disconnect()).toBeUndefined();

		const keyv2 = new Keyv({ store: new Map() });
		expect(await keyv2.disconnect()).toBeUndefined();
	});

	test("emit disconnect event and handle error", async () => {
		const keyv = new Keyv();
		keyv.on("disconnect", () => {
			expect(true).toBeTruthy();
		});
		await keyv.disconnect();

		const keyv2 = new Keyv({ store: new Map() });
		keyv2.store.disconnect = vi.fn().mockRejectedValue(new Error("disconnect error"));
		const errorHandler = vi.fn();
		keyv2.on("error", errorHandler);
		await keyv2.disconnect();
		expect(errorHandler).toHaveBeenCalledWith(new Error("disconnect error"));
	});
});

describe("stats", () => {
	test("opts.stats and stats setter", () => {
		const keyv = new Keyv({ stats: true });
		expect(keyv.stats.enabled).toBe(true);
		const newStats = new KeyvStats({ enabled: true });
		keyv.stats = newStats;
		expect(keyv.stats).toBe(newStats);
	});
});

describe("iterator", () => {
	test("should exist with store adapter", () => {
		const keyv = new Keyv({ store: createStore() });
		expect(typeof keyv.iterator).toBe("function");
	});

	test("doesn't yield values from other namespaces with various configurations", async () => {
		const configs = [
			{}, // plain
			{ compression: createMockCompression() },
			{
				serialization: {
					stringify: (d: unknown) => JSON.stringify(d),
					parse: <T>(d: string) => JSON.parse(d) as T,
				},
			},
		];

		for (const extraOpts of configs) {
			const keyvStore = new Map();
			const keyv1 = new Keyv({ store: keyvStore, namespace: "keyv1", ...extraOpts });
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

			const keyv2 = new Keyv({ store: keyvStore, namespace: "keyv2", ...extraOpts });
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

			for await (const [key, value] of keyv2.iterator()) {
				const doesKeyExist = map2.has(key);
				const isValueSame = map2.get(key) === value;
				expect(doesKeyExist && isValueSame).toBeTruthy();
			}
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

	test("store without iterator support yields no entries (constructor and setter)", async () => {
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
		const keyv1 = new Keyv(store as any);
		const entries1: unknown[] = [];
		for await (const entry of keyv1.iterator()) {
			entries1.push(entry);
		}
		expect(entries1.length).toBe(0);

		// Via setter
		const keyv2 = new Keyv();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		keyv2.store = store as any;
		const entries2: unknown[] = [];
		for await (const _entry of keyv2.iterator()) {
			entries2.push(_entry);
		}
		expect(entries2.length).toBe(0);
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
		const keyv = new Keyv({ store: store as any, checkExpired: true });
		await keyv.set("fresh", "value1");
		await keyv.set("expired", "value2", 1);
		await delay(10);

		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry as [string, unknown]);
		}
		expect(entries.length).toBe(1);
		expect(entries[0][0]).toBe("fresh");
		expect(await keyv.has("expired")).toBe(false);
	});

	test("should not increment deletes stat indefinitely", async () => {
		vi.useFakeTimers();
		try {
			const keyv = new Keyv({ stats: true });
			await keyv.set("foo", "bar", 100);
			expect(keyv.stats.deletes).toBe(0);
			vi.advanceTimersByTime(101);

			let iterationCount = 0;
			for await (const _ of keyv.iterator() ?? []) {
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(0);

			iterationCount = 0;
			for await (const _ of keyv.iterator() ?? []) {
				iterationCount++;
			}
			expect(iterationCount).toBe(0);
			expect(keyv.stats.deletes).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("checkExpired", () => {
	test("checkExpired getter defaults to false and can be set to true", () => {
		expect(new Keyv().checkExpired).toBe(false);
		expect(new Keyv({ checkExpired: true }).checkExpired).toBe(true);
	});

	test("get/getMany/getRaw/getManyRaw return undefined for expired keys", async () => {
		const keyv = new Keyv({ checkExpired: true });
		await keyv.set("foo", "bar", 1);
		await keyv.set("baz", "qux");
		await delay(10);

		expect(await keyv.get("foo")).toBeUndefined();

		const values = await keyv.get(["foo", "baz"]);
		expect(values[0]).toBeUndefined();
		expect(values[1]).toBe("qux");

		await keyv.set("foo2", "bar2", 1);
		await delay(10);
		expect(await keyv.getRaw("foo2")).toBeUndefined();

		await keyv.set("foo3", "bar3", 1);
		await keyv.set("baz3", "qux3");
		await delay(10);
		const rawValues = await keyv.getManyRaw(["foo3", "baz3"]);
		expect(rawValues[0]).toBeUndefined();
		expect(rawValues[1]).toEqual({ value: "qux3" });
	});

	test("has/hasMany work correctly with expired keys", async () => {
		const keyv = new Keyv({ checkExpired: true });
		await keyv.set("foo", "bar");
		expect(await keyv.has("foo")).toBe(true);

		await keyv.set("exp", "val", 1);
		await delay(10);
		expect(await keyv.has("exp")).toBe(false);

		await keyv.set("exp2", "val2", 1);
		await keyv.set("baz", "qux");
		await delay(10);
		expect(await keyv.has(["exp2", "baz"])).toEqual([false, true]);
	});
});

describe("throwErrors", () => {
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

	type TestData = { key: string; value: string };
	let testData: TestData[] = [];
	let testKeys: string[] = [];

	beforeEach(() => {
		testData = Array.from({ length: 5 }, () => ({
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		}));
		testKeys = testData.map((data) => data.key);
	});

	test("throwOnErrors getter/setter and constructor option", () => {
		const keyv = new Keyv(throwingStore);
		expect(keyv.throwOnErrors).toBe(false);
		keyv.throwOnErrors = true;
		expect(keyv.throwOnErrors).toBe(true);

		const keyv2 = new Keyv({ store: throwingStore, throwOnErrors: true });
		expect(keyv2.throwOnErrors).toBe(true);
	});

	test("should throw on set/get/delete/clear/has when throwOnErrors is true", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.set("key", "value")).rejects.toThrow("Test error");
		await expect(keyv.get("key")).rejects.toThrow("Test error");
		await expect(keyv.delete("key")).rejects.toThrow("Test error");
		await expect(keyv.clear()).rejects.toThrow("Test error");
		await expect(keyv.has("key")).rejects.toThrow("Test error");
	});

	test("should not throw when throwOnErrors is false", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = false;
		keyv.on("error", () => {});
		expect(await keyv.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10))).toBe(
			false,
		);
		expect(await keyv.get(faker.string.alphanumeric(10))).toBeUndefined();
		expect(await keyv.delete(faker.string.alphanumeric(10))).toBe(false);
		expect(await keyv.clear()).toBeUndefined();
		expect(await keyv.has(faker.string.alphanumeric(10))).toBe(false);
	});

	test("should throw on deleteMany and setMany when throwOnErrors is true", async () => {
		const keyv = new Keyv(throwingStore);
		keyv.throwOnErrors = true;
		await expect(keyv.deleteMany(testKeys)).rejects.toThrow("Test error");
		await expect(keyv.setMany(testData)).rejects.toThrow("Test error");
	});
});

describe("sanitize", () => {
	test("should not sanitize keys by default", async () => {
		const keyv = new Keyv();
		await keyv.set("test'; DROP TABLE", "value");
		expect(await keyv.get("test'; DROP TABLE")).toBe("value");
	});

	test("should sanitize keys when enabled and support granular control", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("test; DROP TABLE", "value");
		expect(await keyv.get("test DROP TABLE")).toBe("value");

		const keyv2 = new Keyv({ sanitize: { keys: { sql: true, mongo: false } } });
		await keyv2.set("$key;test", "value");
		expect(await keyv2.get("$keytest")).toBe("value");
	});

	test("should sanitize keys in getMany, has, delete, and setMany", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("clean-key", "value1");
		const result = await keyv.getMany(["clean-key", "miss;key"]);
		expect(result[0]).toBe("value1");
		expect(result[1]).toBeUndefined();

		await keyv.set("test-key", "value");
		expect(await keyv.has("test-key")).toBe(true);
		expect(await keyv.has("test'-key")).toBe(false);

		await keyv.set("testkey", "value");
		await keyv.delete("test;key");
		expect(await keyv.has("testkey")).toBe(false);

		await keyv.setMany([
			{ key: "key;1", value: "value1" },
			{ key: "key--2", value: "value2" },
		]);
		expect(await keyv.get("key1")).toBe("value1");
		expect(await keyv.get("key2")).toBe("value2");
	});

	test("getter/setter and updateOptions", () => {
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

	test("updateOptions enables sanitization categories", async () => {
		const keyv = new Keyv();
		(keyv.sanitize as KeyvSanitize).updateOptions({ keys: true, namespace: true });
		await keyv.set("test;../key\0val", "value");
		expect(await keyv.get("testkeyval")).toBe("value");

		const keyv2 = new Keyv();
		(keyv2.sanitize as KeyvSanitize).updateOptions({
			keys: { sql: true, mongo: false, path: false },
		});
		await keyv2.set("test;$key/../path", "value");
		expect(await keyv2.get("test$key/../path")).toBe("value");
	});

	test("harmless characters pass through when sanitization is enabled", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		await keyv.set("user's-data", "value");
		expect(await keyv.get("user's-data")).toBe("value");
	});

	test("namespace sanitization at construction, setter, and independent patterns", () => {
		const keyv1 = new Keyv({ namespace: "ns;evil", sanitize: { keys: true, namespace: true } });
		expect(keyv1.namespace).toBe("nsevil");

		const keyv2 = new Keyv({ sanitize: { keys: true, namespace: true } });
		keyv2.namespace = "ns;evil";
		expect(keyv2.namespace).toBe("nsevil");

		const keyv3 = new Keyv({ namespace: "ns;evil", sanitize: { namespace: false } });
		expect(keyv3.namespace).toBe("ns;evil");
	});

	test("should support independent patterns for keys and namespace", async () => {
		const keyv = new Keyv({
			namespace: "ns;../test",
			sanitize: { keys: { sql: true, path: false }, namespace: { sql: false, path: true } },
		});
		expect(keyv.namespace).toBe("ns;test");
		await keyv.set("key;../value", "data");
		expect(await keyv.get("key../value")).toBe("data");
	});

	test("empty key after sanitization is gracefully rejected", async () => {
		const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
		expect(await keyv.set(";", "value")).toBe(false);
		expect(await keyv.get(";")).toBeUndefined();
		expect(await keyv.getRaw(";")).toBeUndefined();
		expect(await keyv.setRaw(";", { value: "value", expires: undefined })).toBe(false);
		expect(await keyv.delete(";")).toBe(false);
		expect(await keyv.has(";")).toBe(false);
	});
});

describe("decodeWithExpire", () => {
	test("should return undefined for string data when serialization is disabled", async () => {
		const keyv = new Keyv({ serialization: false });
		expect(await keyv.decodeWithExpire("key", "some-string-value")).toEqual([undefined]);
	});

	test("should handle mixed valid and undeserializable data", async () => {
		const keyv = new Keyv({ serialization: false });
		const validData = { value: "bar", expires: undefined };
		const result = await keyv.decodeWithExpire(
			["key1", "key2"],
			[validData, "undeserializable-string"],
		);
		expect(result[0]?.value).toBe("bar");
		expect(result[1]).toBeUndefined();
	});

	test("should not call decompress for object data when compression is enabled but serialization is disabled", async () => {
		const mockCompression = {
			compress: vi.fn((data: string) => data),
			decompress: vi.fn((data: string) => data),
		};
		const keyv = new Keyv({ serialization: false, compression: mockCompression });
		const objectData = { value: "test-value", expires: undefined };
		const result = await keyv.decodeWithExpire("key", objectData);
		expect(result[0]?.value).toBe("test-value");
		expect(mockCompression.decompress).not.toHaveBeenCalled();
	});
});
