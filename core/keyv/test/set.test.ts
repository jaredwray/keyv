import { faker } from "@faker-js/faker";
import tk from "timekeeper";
import * as testRunner from "vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Keyv, { KeyvMemoryAdapter, type KeyvStorageAdapter } from "../src/index.js";
import { createStore } from "./test-utils.js";

describe("Keyv", async () => {
	type TestData = {
		key: string;
		value: string;
	};

	let testData: TestData[] = [];

	beforeEach(() => {
		testData = [];
		for (let i = 0; i < 5; i++) {
			testData.push({
				key: faker.string.alphanumeric(10),
				value: faker.string.alphanumeric(10),
			});
		}

		vi.useFakeTimers();

		return () => {
			vi.useRealTimers();
		};
	});

	describe("setMany", async () => {
		test("the function exists", async () => {
			const keyv = new Keyv();
			expect(keyv.setMany).toBeDefined();
		});

		test("returns a promise that is empty if nothing is sent in", async () => {
			const keyv = new Keyv();
			const result = await keyv.setMany([]);
			expect(result.length).toEqual(0);
		});

		test("returns multiple responses on in memory storage", async () => {
			const keyv = new Keyv();
			const result = await keyv.setMany(testData);
			expect(result.length).toEqual(testData.length);
			const resultValue = await keyv.get(testData[0].key);
			expect(resultValue).toEqual(testData[0].value);
		});

		test("does not call set when setMany is available", async () => {
			const setManyMock = vi.fn((data: TestData[]) => data.map(() => true));
			const adapter = new KeyvMemoryAdapter(new Map());
			adapter.setMany = setManyMock;
			const setSpy = vi.spyOn(adapter, "set");
			const keyv = new Keyv({ store: adapter });

			await keyv.setMany(testData);
			expect(setManyMock).toHaveBeenCalled();
			expect(setSpy).not.toHaveBeenCalled();
		});
	});
});

testRunner.it("Keyv passes ttl info to stores", async (t) => {
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

testRunner.it("Keyv respects default ttl option", async (t) => {
	const store = new Map();
	const keyv = new Keyv({ store, ttl: 100 });
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get("foo")).toBeUndefined();
	t.expect(store.size).toBe(0);
	tk.reset();
});

testRunner.it(".set(key, val, ttl) overwrites default ttl option", async (t) => {
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

testRunner.it(
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

testRunner.it("Keyv respects default ttl option (duplicate)", async (t) => {
	const store = new Map();
	const keyv = new Keyv({ store, ttl: 100 });
	await keyv.set("foo", "bar");
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get("foo")).toBeUndefined();
	t.expect(store.size).toBe(0);
	tk.reset();
});

testRunner.it("should be able to set the ttl as default option and then property", async (t) => {
	const keyv = new Keyv({ store: new Map(), ttl: 100 });
	t.expect(keyv.ttl).toBe(100);
	keyv.ttl = 200;
	t.expect(keyv.ttl).toBe(200);
	t.expect(keyv.ttl).toBe(200);
});

testRunner.it(
	"should be able to set the ttl as default option and then property with undefined",
	async (t) => {
		const keyv = new Keyv({ store: new Map() });
		t.expect(keyv.ttl).not.toBeDefined();
		keyv.ttl = 200;
		t.expect(keyv.ttl).toBe(200);
		t.expect(keyv.ttl).toBe(200);
		keyv.ttl = undefined;
		t.expect(keyv.ttl).not.toBeDefined();
		t.expect(keyv.ttl).not.toBeDefined();
	},
);

testRunner.it("should emit error if set fails", async (t) => {
	const adapter = new KeyvMemoryAdapter(new Map());
	adapter.set = testRunner.vi.fn().mockRejectedValue(new Error("store set error"));
	const keyv = new Keyv({ store: adapter });
	const errorHandler = testRunner.vi.fn();
	keyv.on("error", errorHandler);
	const result = await keyv.set("foo", "bar");
	t.expect(result).toBe(false);
	t.expect(errorHandler).toHaveBeenCalledWith(new Error("store set error"));
});

testRunner.it("should return when value equals non boolean", async (t) => {
	const store = new Map();
	// @ts-expect-error
	store.set = () => "foo";
	const keyv = new Keyv(store);
	const result = await keyv.set("foo111", "bar111");
	t.expect(result).toBe(true);
});

testRunner.it("should return store set value equals non boolean", async (t) => {
	const store = new Map();
	// @ts-expect-error
	store.set = () => true;
	const keyv = new Keyv(store);
	const result = await keyv.set("foo1112", "bar1112");
	t.expect(result).toBe(true);
});

testRunner.it(
	"should emit error and return false when setting a Symbol value with serialization",
	async (t) => {
		const keyv = new Keyv({ store: new Map() });
		const errorHandler = testRunner.vi.fn();
		keyv.on("error", errorHandler);
		const result = await keyv.set("key", Symbol("test"));
		t.expect(result).toBe(false);
		t.expect(errorHandler).toHaveBeenCalledWith(
			"symbol cannot be stored with the current configuration",
		);
	},
);

testRunner.it(
	"should allow setting a Symbol value on mapLike store without serialization",
	async (t) => {
		const keyv = new Keyv({ store: new Map(), serialization: false });
		const sym = Symbol("test");
		const result = await keyv.set("key", sym);
		t.expect(result).toBe(true);
		const value = await keyv.get("key");
		t.expect(value).toBe(sym);
	},
);

testRunner.it(
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

testRunner.it("setMany returns false entries when store.setMany throws", async (t) => {
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

testRunner.it("setMany should fallback to individual set when store has no setMany", async (t) => {
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
