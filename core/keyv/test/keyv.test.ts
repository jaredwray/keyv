import { faker } from "@faker-js/faker";
import tk from "timekeeper";
import * as test from "vitest";
import Keyv, { KeyvMemoryAdapter, type KeyvStorageAdapter } from "../src/index.js";
import { KeyvStats } from "../src/stats.js";
import { createMockCompression, createStore, delay } from "./test-utils.js";

const snooze = delay;

test.it("Keyv is a class", (t) => {
	t.expect(typeof Keyv).toBe("function");
	// @ts-expect-error
	t.expect(() => Keyv()).toThrow(); // eslint-disable-line new-cap
	t.expect(() => new Keyv()).not.toThrow();
});

test.it("Keyv accepts storage adapters", async (t) => {
	const store = new Map();
	const keyv = new Keyv<string>({ store });
	t.expect(store.size).toBe(0);
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(store.size).toBe(1);
});

test.it("Keyv accepts storage adapters and options", async (t) => {
	const store = new Map();
	const keyv = new Keyv(store, { namespace: "test" });
	t.expect(store.size).toBe(0);
	await keyv.set("foo", "bar");
	t.expect(keyv.namespace).toBe("test");
});

test.it("Keyv accepts storage adapters instead of options", async (t) => {
	const store = new Map();
	const keyv = new Keyv<string>(store);
	t.expect(store.size).toBe(0);
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(store.size).toBe(1);
});

test.it("Keyv allows get and set the store via property", async (t) => {
	const store = new Map();
	const keyv = new Keyv<string>();
	keyv.store = store;
	t.expect(store.size).toBe(0);
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(store.size).toBe(1);
	t.expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);
});

test.it("Keyv should throw if invalid storage or Map on store property", async (t) => {
	const store = new Map();
	const keyv = new Keyv<string>();
	keyv.store = store;
	t.expect(store.size).toBe(0);
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(store.size).toBe(1);
	t.expect(keyv.store).toBeInstanceOf(KeyvMemoryAdapter);

	t.expect(() => {
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		keyv.store = { get() {}, set() {}, delete() {} };
	}).toThrow();
});

test.it("Keyv passes ttl info to stores", async (t) => {
	t.expect.assertions(1);
	const store = new Map();
	const storeSet = store.set;
	// @ts-expect-error
	store.set = (key, value, ttl) => {
		t.expect(ttl).toBe(100);
		// @ts-expect-error
		storeSet.call(store, key, value, ttl);
	};

	const keyv = new Keyv({ store });
	await keyv.set("foo", "bar", 100);
});

test.it("Keyv respects default ttl option", async (t) => {
	const store = new Map();
	const keyv = new Keyv({ store, ttl: 100 });
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get("foo")).toBeUndefined();
	t.expect(store.size).toBe(0);
	tk.reset();
});

test.it(".set(key, val, ttl) overwrites default ttl option", async (t) => {
	const startTime = Date.now();
	tk.freeze(startTime);
	const keyv = new Keyv({ ttl: 200 });
	await keyv.set("foo", "bar");
	await keyv.set("fizz", "buzz", 100);
	await keyv.set("ping", "pong", 300);
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(await keyv.get("fizz")).toBe("buzz");
	t.expect(await keyv.get("ping")).toBe("pong");
	tk.freeze(startTime + 150);
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(await keyv.get("fizz")).toBeUndefined();
	t.expect(await keyv.get("ping")).toBe("pong");
	tk.freeze(startTime + 250);
	t.expect(await keyv.get("foo")).toBeUndefined();
	t.expect(await keyv.get("ping")).toBe("pong");
	tk.freeze(startTime + 350);
	t.expect(await keyv.get("ping")).toBeUndefined();
	tk.reset();
});

test.it(
	'.set(key, val, ttl) where ttl is "0" overwrites default ttl option and sets key to never expire',
	async (t) => {
		const startTime = Date.now();
		tk.freeze(startTime);
		const store = new Map();
		const keyv = new Keyv({ store, ttl: 200 });
		await keyv.set("foo", "bar", 0);
		t.expect(await keyv.get("foo")).toBe("bar");
		tk.freeze(startTime + 250);
		t.expect(await keyv.get("foo")).toBe("bar");
		tk.reset();
	},
);

test.it(".getRaw(key) returns the raw object instead of the value", async (t) => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	const value = await keyv.get("foo");
	const rawObject = await keyv.getRaw("foo");
	t.expect(value).toBe("bar");
	t.expect(rawObject?.value).toBe("bar");
});

test.it("Keyv uses custom serializer when provided instead of default", async (t) => {
	t.expect.assertions(3);
	const store = new Map();
	const serialization = {
		stringify(data: unknown) {
			t.expect(true).toBeTruthy();
			return JSON.stringify(data);
		},
		parse<T>(data: string) {
			t.expect(true).toBeTruthy();
			return JSON.parse(data) as T;
		},
	};

	const keyv = new Keyv({ store, serialization });
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
});

test.it("Keyv supports async serializer/deserializer", async (t) => {
	t.expect.assertions(3);
	const serialization = {
		async stringify(data: unknown) {
			t.expect(true).toBeTruthy();
			return JSON.stringify(data);
		},
		async parse<T>(data: string) {
			t.expect(true).toBeTruthy();
			return JSON.parse(data) as T;
		},
	};

	const keyv = new Keyv({ serialization });
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
});

test.it("Keyv should wait for the expired get", async (t) => {
	t.expect.assertions(4);
	const _store = new Map();
	const store = {
		get: async (key: string) => _store.get(key),
		// biome-ignore lint/suspicious/noExplicitAny: type format
		set(key: string, value: any) {
			_store.set(key, value);
		},
		clear() {
			_store.clear();
		},
		async delete(key: string) {
			await new Promise<void>((resolve) => {
				setTimeout(() => {
					// Simulate database latency
					resolve();
				}, 20);
			});
			return _store.delete(key);
		},
	} as KeyvStorageAdapter;

	const keyv = new Keyv({ store });

	// Round 1
	const v1 = await keyv.get("foo");
	t.expect(v1).toBeUndefined();

	await keyv.set("foo", "bar", 1000);
	const v2 = await keyv.get("foo");
	t.expect(v2).toBe("bar");

	await new Promise<void>((resolve) => {
		setTimeout(() => {
			// Wait for expired
			resolve();
		}, 1100);
	});

	// Round 2
	const v3 = await keyv.get("foo");
	t.expect(v3).toBeUndefined();

	await keyv.set("foo", "bar", 1000);
	await new Promise<void>((resolve) => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const v4 = await keyv.get("foo");
	t.expect(v4).toBe("bar");
});

test.it("keyv should trigger an error when store is invalid", async (t) => {
	const store = new Map();

	t.expect(
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

test.it(
	".delete([keys]) should delete multiple keys for storage adapter not supporting deleteMany",
	async (t) => {
		const keyv = new Keyv({ store: new Map() });
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.set("foo2", "bar2");
		t.expect(await keyv.delete(["foo", "foo1", "foo2"])).toBeTruthy();
		t.expect(await keyv.get("foo")).toBeUndefined();
		t.expect(await keyv.get("foo1")).toBeUndefined();
		t.expect(await keyv.get("foo2")).toBeUndefined();
	},
);

test.it(
	".delete([keys]) with nonexistent keys resolves to array of false for storage adapter not supporting deleteMany",
	async (t) => {
		const keyv = new Keyv({ store: new Map() });
		t.expect(await keyv.delete(["foo", "foo1", "foo2"])).toEqual([false, false, false]);
	},
);

test.it("keyv.get([keys]) should return array values", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	const values = (await keyv.get<string>(["foo", "foo1", "foo2"])) as string[];
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBe("bar1");
	t.expect(values[2]).toBe("bar2");

	const rawValues = await keyv.getManyRaw<string>(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(rawValues)).toBeTruthy();
	t.expect(rawValues[0]).toEqual({ value: "bar" });
	t.expect(rawValues[1]).toEqual({ value: "bar1" });
	t.expect(rawValues[2]).toEqual({ value: "bar2" });
});

test.it("keyv.get([keys]) should return array value undefined when expires", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1", 1);
	await keyv.set("foo2", "bar2");
	await new Promise<void>((resolve) => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const values = await keyv.get<string>(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe("bar2");
});

test.it("keyv.get([keys]) should return array value undefined when expires sqlite", async (t) => {
	const keyv = new Keyv({ store: new Map() });

	const dataSet = [
		{
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		},
		{
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
			ttl: 10,
		},
		{
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		},
	];

	for (const { key, value, ttl } of dataSet) {
		// eslint-disable-next-line no-await-in-loop
		await keyv.set(key, value, ttl);
	}

	await delay(30);
	const values = await keyv.get<string>(dataSet.map((item) => item.key));
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values).toEqual([dataSet[0].value, undefined, dataSet[2].value]);
});

test.it(
	"keyv.get([keys]) should return empty array when expires with storage adapter",
	async (t) => {
		const keyv = new Keyv({ store: createStore() });
		await keyv.clear();
		await keyv.set("foo", "bar", 1);
		await keyv.set("foo1", "bar1", 1);
		await keyv.set("foo2", "bar2", 1);
		await new Promise<void>((resolve) => {
			setTimeout(() => {
				resolve();
			}, 30);
		});
		const values = await keyv.get(["foo", "foo1", "foo2"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values.length).toBe(3);
	},
);

test.it(
	"keyv.getManyRaw([keys]) should return array raw values with storage adapter",
	async (t) => {
		const keyv = new Keyv({ store: createStore() });
		await keyv.clear();
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		const values = await keyv.getManyRaw<string>(["foo", "foo1"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toEqual({ value: "bar" });
		t.expect(values[1]).toEqual({ value: "bar1" });
	},
);

test.it(
	"keyv.getManyRaw([keys]) should return array raw values undefined with storage adapter",
	async (t) => {
		const keyv = new Keyv({ store: createStore() });
		await keyv.clear();
		const values = await keyv.getManyRaw<string>(["foo", "foo1"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBeUndefined();
		t.expect(values[1]).toBeUndefined();
	},
);

test.it("keyv.get([keys]) should return array values with undefined", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await keyv.set("foo", "bar");
	await keyv.set("foo2", "bar2");
	const values = await keyv.get<string>(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe("bar");
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe("bar2");
});

test.it(
	"keyv.get([keys]) should return array values with all undefined using storage adapter",
	async (t) => {
		const keyv = new Keyv({ store: createStore() });
		const values = await keyv.get<string>(["foo", "foo1", "foo2"]);
		t.expect(Array.isArray(values)).toBeTruthy();
		t.expect(values[0]).toBeUndefined();
		t.expect(values[1]).toBeUndefined();
		t.expect(values[2]).toBeUndefined();
	},
);

test.it("keyv.get([keys]) should return undefined array for all no existent keys", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	const values = await keyv.get(["foo", "foo1", "foo2"]);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values).toEqual([undefined, undefined, undefined]);
});

test.it("pass compress options", async (t) => {
	const keyv = new Keyv({
		store: new Map(),
		compression: createMockCompression(),
	});
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
});

test.it("iterator should exist with store adapter", (t) => {
	const keyv = new Keyv({
		store: createStore(),
	});
	t.expect(typeof keyv.iterator).toBe("function");
});

test.it(
	"keyv iterator() doesn't yield values from other namespaces with compression",
	async (t) => {
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

		t.expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it("keyv iterator() doesn't yield values from other namespaces", async (t) => {
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

	t.expect.assertions(map2.size);
	for await (const [key, value] of keyv2.iterator()) {
		const doesKeyExist = map2.has(key);
		const isValueSame = map2.get(key) === value;
		t.expect(doesKeyExist && isValueSame).toBeTruthy();
	}
});

test.it(
	"keyv iterator() doesn't yield values from other namespaces with custom serializer/deserializer",
	async (t) => {
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

		t.expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it(
	"keyv iterator() doesn't yield values from other namespaces with custom serializer/deserializer and compression",
	async (t) => {
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

		t.expect.assertions(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.expect(doesKeyExist && isValueSame).toBeTruthy();
		}
	},
);

test.it("close connection successfully", async (t) => {
	const keyv = new Keyv({ store: createStore() });
	await keyv.clear();
	t.expect(await keyv.get("foo")).toBeUndefined();
	await keyv.set("foo", "bar");
	t.expect(await keyv.disconnect()).toBeUndefined();
});

test.it("close connection undefined", async (t) => {
	const store = new Map();
	const keyv = new Keyv({ store });
	t.expect(await keyv.disconnect()).toBeUndefined();
});

test.it("get keys, one key expired", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await keyv.set("foo", "bar", 10_000);
	await keyv.set("fizz", "buzz", 100);
	await keyv.set("ping", "pong", 10_000);
	await snooze(150);
	await keyv.get(["foo", "fizz", "ping"]);
	t.expect(await keyv.get("fizz")).toBeUndefined();
	t.expect(await keyv.get("foo")).toBe("bar");
	t.expect(await keyv.get("ping")).toBe("pong");
});

test.it("emit clear event", async (t) => {
	const keyv = new Keyv();
	keyv.on("clear", () => {
		t.expect(true).toBeTruthy();
	});
	await keyv.clear();
});

test.it("emit disconnect event", async (t) => {
	const keyv = new Keyv();
	keyv.on("disconnect", () => {
		t.expect(true).toBeTruthy();
	});
	await keyv.disconnect();
});

test.it("Keyv has should return if adapter does not support has", async (t) => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	t.expect(await keyv.has("foo")).toBe(true);
	t.expect(await keyv.has("fizz")).toBe(false);
});

test.it("Keyv has should return if Map and undefined expires", async (t) => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	t.expect(await keyv.has("foo")).toBe(true);
	t.expect(await keyv.has("fizz")).toBe(false);
});

test.it("Keyv has should return if adapter does not support has on expired", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	keyv.store.has = undefined;
	await keyv.set("foo", "bar", 1000);
	t.expect(await keyv.has("foo")).toBe(true);
	await snooze(1100);
	t.expect(await keyv.has("foo")).toBe(false);
});

test.it("Keyv has should return false on expired", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	const keyName = "expired-key";
	await keyv.set(keyName, "bar", 1000);
	await snooze(1100);
	const value = await keyv.get(keyName);
	const exists = await keyv.has(keyName);
	t.expect(value).toBeUndefined();
	t.expect(exists).toBe(false);
});

test.it("Keyv has should return true or false on Map", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	await keyv.set("foo", "bar", 1000);
	t.expect(await keyv.has("foo")).toBe(true);
	await snooze(1100);
	t.expect(await keyv.has("foo")).toBe(false);
});

test.it("Keyv opts.stats should set the stats manager", (t) => {
	const keyv = new Keyv({ stats: true });
	t.expect(keyv.stats.enabled).toBe(true);
});

test.it("Keyv stats setter should replace the stats manager", (t) => {
	const keyv = new Keyv({ stats: true });
	const newStats = new KeyvStats({ enabled: true });
	keyv.stats = newStats;
	t.expect(keyv.stats).toBe(newStats);
});

test.it("Keyv stats enabled should create counts", async (t) => {
	const keyv = new Keyv({ stats: true });
	await keyv.set("foo", "bar");
	await keyv.get("foo");
	await keyv.get("foo1");
	await keyv.delete("foo");
	t.expect(keyv.stats.hits).toBe(1);
	t.expect(keyv.stats.misses).toBe(1);
	t.expect(keyv.stats.deletes).toBe(1);
	t.expect(keyv.stats.sets).toBe(1);
});

test.it("should be able to set the namespace via property", async (t) => {
	const store = createStore();
	const keyv = new Keyv({ store });
	t.expect(keyv.namespace).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	keyv.namespace = "test";
	t.expect(keyv.namespace).toBe("test");
	t.expect(store.namespace).toBe("test");
});

test.it("should be able to set the store via property", async (t) => {
	const store = createStore();
	const keyv = new Keyv();
	keyv.store = store;
	t.expect(keyv.store).toBe(store);
});

test.it("Keyv respects default ttl option", async (t) => {
	const store = new Map();
	const keyv = new Keyv({ store, ttl: 100 });
	await keyv.set("foo", "bar");
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get("foo")).toBeUndefined();
	t.expect(store.size).toBe(0);
	tk.reset();
});

test.it("should be able to set the ttl as default option and then property", async (t) => {
	const keyv = new Keyv({ store: new Map(), ttl: 100 });
	t.expect(keyv.ttl).toBe(100);
	keyv.ttl = 200;
	t.expect(keyv.ttl).toBe(200);
	t.expect(keyv.ttl).toBe(200);
});

test.it("should be able to set the ttl as default option and then property", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	t.expect(keyv.ttl).not.toBeDefined();
	keyv.ttl = 200;
	t.expect(keyv.ttl).toBe(200);
	t.expect(keyv.ttl).toBe(200);
	keyv.ttl = undefined;
	t.expect(keyv.ttl).not.toBeDefined();
	t.expect(keyv.ttl).not.toBeDefined();
});

test.it("Keyv does get and set on serialization property", async (t) => {
	const serialization = {
		stringify: (data: unknown) => JSON.stringify(data),
		parse: <T>(data: string) => JSON.parse(data) as T,
	};
	const keyv = new Keyv({
		store: new Map(),
		serialization,
	});
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");

	const newSerialization = {
		stringify: (data: unknown) => JSON.stringify(data),
		parse: <T>(data: string) => JSON.parse(data) as T,
	};
	keyv.serialization = newSerialization;
	t.expect(keyv.serialization).toBe(newSerialization);
});

test.it("Keyv can get and set the compress property", async (t) => {
	const keyv = new Keyv();
	const compression = createMockCompression();
	t.expect(keyv.compression).not.toBeDefined();
	keyv.compression = compression;
	t.expect(keyv.compression).toBe(compression);
});

test.it("Keyv will not prefix if there is no namespace", async (t) => {
	const keyv = new Keyv();
	t.expect(keyv.namespace).toBeUndefined();
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.set("foo2", "bar2");
	t.expect(await keyv.get("foo")).toBe("bar");
	const values = (await keyv.get<string>(["foo", "foo1", "foo2"])) as string[];
	t.expect(values).toStrictEqual(["bar", "bar1", "bar2"]);
});

test.it("empty key after sanitization is gracefully rejected", async (t) => {
	const keyv = new Keyv({ sanitize: { keys: true, namespace: true } });
	// ";" is stripped to "" (semicolon is a dangerous SQL pattern)
	t.expect(await keyv.set(";", "value")).toBe(false);
	t.expect(await keyv.get(";")).toBeUndefined();
	t.expect(await keyv.getRaw(";")).toBeUndefined();
	t.expect(await keyv.setRaw(";", { value: "value", expires: undefined })).toBe(false);
	t.expect(await keyv.delete(";")).toBe(false);
	t.expect(await keyv.has(";")).toBe(false);
});

test.it(
	"Keyv will not serialize / deserialize / compress if serialization is undefined",
	async (t) => {
		const keyv = new Keyv({ compression: createMockCompression() });
		keyv.serialization = undefined;
		const complexObject = { foo: "bar", fizz: "buzz" };
		await keyv.set("foo-complex", complexObject);
		await keyv.set("foo", "bar");
		t.expect(await keyv.get("foo")).toBe("bar");
		t.expect(await keyv.get("foo-complex")).toStrictEqual(complexObject);
	},
);

test.it("Keyv deserializeData will return the data object if not string", async (t) => {
	const keyv = new Keyv();
	const complexObject = { foo: "bar", fizz: "buzz" };
	const result = await keyv.deserializeData({ value: complexObject });
	t.expect(result).toStrictEqual({ value: complexObject });
});

test.it("deserializeData returns undefined for null/undefined input", async (t) => {
	const keyv = new Keyv();
	// biome-ignore lint/suspicious/noExplicitAny: test
	t.expect(await keyv.deserializeData(undefined as any)).toBeUndefined();
	// biome-ignore lint/suspicious/noExplicitAny: test
	t.expect(await keyv.deserializeData(null as any)).toBeUndefined();
});

test.it(
	"deserializeData with no serialization and no compression returns raw object",
	async (t) => {
		const keyv = new Keyv({ serialization: false });
		const data = { value: "hello", expires: undefined };
		const result = await keyv.deserializeData(data);
		t.expect(result).toStrictEqual(data);
	},
);

test.it(
	"deserializeData with no serialization and no compression returns undefined for string",
	async (t) => {
		const keyv = new Keyv({ serialization: false });
		const result = await keyv.deserializeData("some-string");
		t.expect(result).toBeUndefined();
	},
);

test.it("deserializeData returns undefined when decompressed string is invalid JSON", async (t) => {
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
	t.expect(result).toBeUndefined();
});

test.it("serialization setter with false clears the adapter", async (t) => {
	const keyv = new Keyv();
	t.expect(keyv.serialization).toBeDefined();
	keyv.serialization = false;
	t.expect(keyv.serialization).toBeUndefined();
});

test.it(
	"serializeData uses JSON.stringify when compression is set without serialization",
	async (t) => {
		const keyv = new Keyv({
			serialization: false,
			compression: createMockCompression(),
		});
		const data = { value: "hello", expires: undefined };
		const result = await keyv.serializeData(data);
		t.expect(result).toBe(JSON.stringify(data));
	},
);

test.it("should emit error if set fails", async (t) => {
	const adapter = new KeyvMemoryAdapter(new Map());
	adapter.set = test.vi.fn().mockRejectedValue(new Error("store set error"));
	const keyv = new Keyv({ store: adapter });
	const errorHandler = test.vi.fn();
	keyv.on("error", errorHandler);
	const result = await keyv.set("foo", "bar");
	t.expect(result).toBe(false);
	t.expect(errorHandler).toHaveBeenCalledWith(new Error("store set error"));
});

test.it("should return when value equals non boolean", async (t) => {
	const store = new Map();
	// @ts-expect-error
	store.set = () => "foo";
	const keyv = new Keyv(store);
	const result = await keyv.set("foo111", "bar111");
	t.expect(result).toBe(true);
});

test.it("should return store set value equals non boolean", async (t) => {
	const store = new Map();
	// @ts-expect-error
	store.set = () => true;
	const keyv = new Keyv(store);
	const result = await keyv.set("foo1112", "bar1112");
	t.expect(result).toBe(true);
});

test.it("should handle error on store delete", async (t) => {
	const store = new Map();
	store.delete = test.vi.fn().mockRejectedValue(new Error("store delete error"));
	const keyv = new Keyv(store);
	const errorHandler = test.vi.fn();
	keyv.on("error", errorHandler);
	const result = await keyv.delete("foo55");
	t.expect(result).toBe(false);
	t.expect(errorHandler).toHaveBeenCalledWith(new Error("store delete error"));
});

test.it("should handle error on store clear", async (t) => {
	const adapter = new KeyvMemoryAdapter(new Map());
	adapter.clear = test.vi.fn().mockRejectedValue(new Error("store clear error"));
	const keyv = new Keyv({ store: adapter });
	const errorHandler = test.vi.fn();
	keyv.on("error", errorHandler);
	await keyv.clear();
	t.expect(errorHandler).toHaveBeenCalledWith(new Error("store clear error"));
});

test.it("should handle error on store has / get", async (t) => {
	const store = new Map();
	store.get = test.vi.fn().mockRejectedValue(new Error("store has error"));
	const keyv = new Keyv(store);
	const errorHandler = test.vi.fn();
	keyv.on("error", errorHandler);
	const result = await keyv.has("foo");
	t.expect(result).toBe(false);
	t.expect(errorHandler).toHaveBeenCalledWith(new Error("store has error"));
});

test.it("should emit error and throw when setting a Symbol value", async (t) => {
	const keyv = new Keyv({ store: new Map() });
	const errorHandler = test.vi.fn();
	keyv.on("error", errorHandler);
	await t.expect(keyv.set("key", Symbol("test"))).rejects.toThrow("symbol cannot be serialized");
	t.expect(errorHandler).toHaveBeenCalledWith("symbol cannot be serialized");
});

test.it("should detect iterable adapter when store has iterator method", async (t) => {
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
	t.expect(keyv.iterator).toBeDefined();
});

test.it("fallback iterator emits error when store does not support iteration", async (t) => {
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
	t.expect(typeof keyv.iterator).toBe("function");

	let errorEmitted = false;
	keyv.on("error", (error: Error) => {
		t.expect(error.message).toBe("Iterator not supported by this storage adapter");
		errorEmitted = true;
	});

	// Consume the iterator
	const entries: unknown[] = [];
	for await (const entry of keyv.iterator()) {
		entries.push(entry);
	}

	t.expect(entries.length).toBe(0);
	t.expect(errorEmitted).toBe(true);
});

test.it(
	"fallback iterator assigned when store is set via setter without iterator support",
	async (t) => {
		const keyv = new Keyv();
		const store: KeyvStorageAdapter = {
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
		t.expect(typeof keyv.iterator).toBe("function");

		let errorEmitted = false;
		keyv.on("error", (error: Error) => {
			errorEmitted = true;
			t.expect(error.message).toBe("Iterator not supported by this storage adapter");
		});

		for await (const _entry of keyv.iterator()) {
			// should not yield
		}

		t.expect(errorEmitted).toBe(true);
	},
);

test.it("iterator works with store that has an iterator method", async (t) => {
	const map = new Map<string, string>();
	const store: KeyvStorageAdapter = {
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

	t.expect(entries.length).toBe(2);
});

test.it("iterator deletes expired entries from store with iterator method", async (t) => {
	const map = new Map<string, string>();
	const store: KeyvStorageAdapter = {
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
	await snooze(10);

	const entries: Array<[string, unknown]> = [];
	for await (const entry of keyv.iterator()) {
		entries.push(entry as [string, unknown]);
	}

	// Only the fresh entry should be yielded; expired should be deleted
	t.expect(entries.length).toBe(1);
	t.expect(entries[0][0]).toBe("fresh");
	t.expect(await keyv.has("expired")).toBe(false);
});

test.it(
	"setMany returns array of true when store.setMany returns void (backward compat)",
	async (t) => {
		const map = new Map<string, unknown>();
		const store: KeyvStorageAdapter = {
			namespace: undefined as string | undefined,
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
			async setMany(_entries: Array<{ key: string; value: unknown; ttl?: number }>) {
				// Intentionally returns void/undefined to simulate old adapter
			},
			on() {
				return store;
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		const keyv = new Keyv({ store: store as any });
		const result = await keyv.setMany([
			{ key: "a", value: "1" },
			{ key: "b", value: "2" },
		]);
		t.expect(result).toEqual([true, true]);
	},
);

test.it("setMany returns false entries when store.setMany throws", async (t) => {
	const store = {
		async get(_key: string) {},
		async set(_key: string, _value: unknown) {},
		async delete(_key: string) {
			return true;
		},
		async clear() {},
		async setMany(_entries: Array<{ key: string; value: unknown; ttl?: number }>) {
			throw new Error("store setMany failure");
		},
		on() {
			return store;
		},
	};
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	const keyv = new Keyv({ store: store as any });
	keyv.on("error", () => {});
	const result = await keyv.setMany([
		{ key: "a", value: "1" },
		{ key: "b", value: "2" },
	]);
	t.expect(result).toEqual([false, false]);
});

// --- Coverage tests for fallback paths ---

test.it("getMany should fallback to individual get when store has no getMany", async (t) => {
	const store = createStore();
	store.getMany = undefined as unknown as typeof store.getMany;
	const keyv = new Keyv({ store });
	await keyv.set("key1", "val1");
	await keyv.set("key2", "val2");
	const result = await keyv.getMany(["key1", "key2", "nonexistent"]);
	t.expect(result).toEqual(["val1", "val2", undefined]);
});

test.it("getMany fallback should handle expired keys", async (t) => {
	const store = createStore();
	store.getMany = undefined as unknown as typeof store.getMany;
	const keyv = new Keyv({ store });
	await keyv.set("key1", "val1", 1);
	await snooze(100);
	const result = await keyv.getMany(["key1"]);
	t.expect(result).toEqual([undefined]);
});

test.it("getManyRaw should fallback to individual get when store has no getMany", async (t) => {
	const store = createStore();
	store.getMany = undefined as unknown as typeof store.getMany;
	const keyv = new Keyv({ store });
	await keyv.set("key1", "val1");
	const result = await keyv.getManyRaw(["key1", "nonexistent"]);
	t.expect(result[0]).toBeDefined();
	t.expect(result[0]?.value).toBe("val1");
	t.expect(result[1]).toBeUndefined();
});

test.it("setMany should fallback to individual set when store has no setMany", async (t) => {
	const store = createStore();
	const keyv = new Keyv({ store });
	const result = await keyv.setMany([
		{ key: "k1", value: "v1" },
		{ key: "k2", value: "v2" },
	]);
	t.expect(result).toEqual([true, true]);
	t.expect(await keyv.get("k1")).toBe("v1");
	t.expect(await keyv.get("k2")).toBe("v2");
});

test.it("has should delegate to store.has when store is not KeyvMemoryAdapter", async (t) => {
	const store = createStore();
	const keyv = new Keyv({ store });
	await keyv.set("foo", "bar");
	t.expect(await keyv.has("foo")).toBe(true);
	t.expect(await keyv.has("nonexistent")).toBe(false);
});
