import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import { Keyv, KeyvHooks } from "../src/index.js";
import { createStore } from "./test-utils.js";

describe("Keyv Set Raw", async () => {
	test("should set and getRaw round-trip", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		const rawValue = { value };
		await keyv.setRaw(key, rawValue);
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value });
	});

	test("should set raw with expires and preserve it exactly", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		const expires = Date.now() + 60_000;
		await keyv.setRaw(key, { value, expires });
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value, expires });
	});

	test("should set raw without expires", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value });
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value });
	});

	test("should be retrievable with normal get", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value });
		const result = await keyv.get(key);
		expect(result).toBe(value);
	});

	test("should return true on success", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const result = await keyv.setRaw(key, { value: "test" });
		expect(result).toBe(true);
	});

	test("should apply default ttl and compute expires", async () => {
		const keyv = new Keyv({ ttl: 60_000 });
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value });
		const result = await keyv.getRaw(key);
		expect(result?.value).toBe(value);
		expect(result?.expires).toBeGreaterThan(Date.now());
	});

	test("should compute expires from ttl when expires is not set", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const before = Date.now();
		await keyv.setRaw(key, { value: "test" }, 60_000);
		const result = await keyv.getRaw(key);
		expect(result).toBeDefined();
		expect(result?.expires).toBeGreaterThanOrEqual(before + 60_000);
		expect(result?.expires).toBeLessThanOrEqual(Date.now() + 60_000);
	});

	test("should not override existing expires when ttl is provided", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const customExpires = Date.now() + 120_000;
		await keyv.setRaw(key, { value: "test", expires: customExpires }, 60_000);
		const result = await keyv.getRaw(key);
		expect(result?.expires).toBe(customExpires);
	});

	test("should track stats", async () => {
		const keyv = new Keyv({ stats: true });
		const key = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value: "test" });
		expect(keyv.stats.sets).toBe(1);
	});

	test("should trigger PRE_SET_RAW hook", async () => {
		const keyv = new Keyv();
		let hookTriggered = false;
		keyv.hooks.addHandler(KeyvHooks.PRE_SET_RAW, () => {
			hookTriggered = true;
		});
		await keyv.setRaw(faker.string.alphanumeric(10), { value: "test" });
		expect(hookTriggered).toBe(true);
	});

	test("should trigger POST_SET_RAW hook", async () => {
		const keyv = new Keyv();
		let hookTriggered = false;
		keyv.hooks.addHandler(KeyvHooks.POST_SET_RAW, () => {
			hookTriggered = true;
		});
		await keyv.setRaw(faker.string.alphanumeric(10), { value: "test" });
		expect(hookTriggered).toBe(true);
	});

	test("should emit error on store failure", async () => {
		const store = createStore();
		store.set = async () => {
			throw new Error("store error");
		};
		const keyv = new Keyv({ store });
		let errorEmitted = false;
		keyv.on("error", () => {
			errorEmitted = true;
		});
		const result = await keyv.setRaw(faker.string.alphanumeric(10), {
			value: "test",
		});
		expect(result).toBe(false);
		expect(errorEmitted).toBe(true);
	});

	test("should throw on store failure when throwOnErrors is true", async () => {
		const store = createStore();
		store.set = async () => {
			throw new Error("store error");
		};
		const keyv = new Keyv({ store, throwOnErrors: true });
		keyv.on("error", () => {});
		await expect(
			keyv.setRaw(faker.string.alphanumeric(10), { value: "test" }),
		).rejects.toThrow("store error");
	});

	test("should treat ttl of 0 as no ttl", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value: "test" }, 0);
		const result = await keyv.getRaw(key);
		expect(result).toBeDefined();
		expect(result?.expires).toBeUndefined();
	});

	test("should use store boolean return value", async () => {
		const store = createStore();
		const originalSet = store.set.bind(store);
		store.set = async (...args: unknown[]) => {
			// biome-ignore lint/suspicious/noExplicitAny: test override
			await (originalSet as any)(...args);
			return true;
		};
		const keyv = new Keyv({ store });
		const result = await keyv.setRaw(faker.string.alphanumeric(10), {
			value: "test",
		});
		expect(result).toBe(true);
	});

	test("should be readable by has() after setRaw", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value: "test" });
		const result = await keyv.has(key);
		expect(result).toBe(true);
	});

	test("should be readable by getManyRaw() after setRaw", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await keyv.setRaw(key, { value });
		const results = await keyv.getManyRaw([key]);
		expect(results).toHaveLength(1);
		expect(results[0]?.value).toBe(value);
	});

	test("getRaw -> modify -> setRaw round-trip", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		await keyv.set(key, "original");
		const raw = await keyv.getRaw<string>(key);
		expect(raw).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: test asserts defined above
		raw!.value = "modified";
		// biome-ignore lint/style/noNonNullAssertion: test asserts defined above
		await keyv.setRaw(key, raw!);
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value: "modified" });
	});
});

describe("Keyv Set Many Raw", async () => {
	test("should set many and getRaw round-trip", async () => {
		const keyv = new Keyv();
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const values = keys.map(() => faker.string.alphanumeric(10));
		const entries = keys.map((key, i) => ({
			key,
			value: { value: values[i] },
		}));
		await keyv.setManyRaw(entries);
		for (const [i, key] of keys.entries()) {
			const result = await keyv.getRaw(key);
			expect(result).toEqual({ value: values[i] });
		}
	});

	test("should set many raw with expires", async () => {
		const keyv = new Keyv();
		const key = faker.string.alphanumeric(10);
		const expires = Date.now() + 60_000;
		await keyv.setManyRaw([{ key, value: { value: "test", expires } }]);
		const result = await keyv.getRaw(key);
		expect(result).toEqual({ value: "test", expires });
	});

	test("should fallback to setRaw when store has no setMany", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: need to remove method for test
		delete (store as any).setMany;
		const keyv = new Keyv({ store });
		const keys = Array.from({ length: 3 }, () => faker.string.alphanumeric(10));
		const entries = keys.map((key) => ({
			key,
			value: { value: faker.string.alphanumeric(10) },
		}));
		const results = await keyv.setManyRaw(entries);
		expect(results).toEqual([true, true, true]);

		for (const entry of entries) {
			const result = await keyv.getRaw(entry.key);
			expect(result).toEqual(entry.value);
		}
	});

	test("should work with store that has setMany returning void", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: add setMany to test store
		(store as any).setMany = async (
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			entries: Array<{ key: string; value: any }>,
		) => {
			for (const { key, value } of entries) {
				await store.set(key, value);
			}
		};
		const keyv = new Keyv({ store });
		const keys = Array.from({ length: 2 }, () => faker.string.alphanumeric(10));
		const entries = keys.map((key) => ({
			key,
			value: { value: "test" },
		}));
		const results = await keyv.setManyRaw(entries);
		expect(Array.isArray(results)).toBe(true);
		expect(results).toEqual([true, true]);
	});

	test("should work with store that has setMany returning boolean[]", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: add setMany to test store
		(store as any).setMany = async (
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			entries: Array<{ key: string; value: any }>,
		) => {
			for (const { key, value } of entries) {
				await store.set(key, value);
			}

			return entries.map(() => true);
		};
		const keyv = new Keyv({ store });
		const keys = Array.from({ length: 2 }, () => faker.string.alphanumeric(10));
		const entries = keys.map((key) => ({
			key,
			value: { value: "test" },
		}));
		const results = await keyv.setManyRaw(entries);
		expect(results).toEqual([true, true]);
	});

	test("should compute expires from ttl via store setMany path", async () => {
		const store = createStore();
		// biome-ignore lint/suspicious/noExplicitAny: add setMany to test store
		(store as any).setMany = async (
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			entries: Array<{ key: string; value: any; ttl?: number }>,
		) => {
			for (const { key, value } of entries) {
				await store.set(key, value);
			}
		};
		const keyv = new Keyv({ store });
		const key = faker.string.alphanumeric(10);
		const before = Date.now();
		await keyv.setManyRaw([{ key, value: { value: "test" }, ttl: 60_000 }]);
		const result = await keyv.getRaw(key);
		expect(result).toBeDefined();
		expect(result?.expires).toBeGreaterThanOrEqual(before + 60_000);
		expect(result?.expires).toBeLessThanOrEqual(Date.now() + 60_000);
	});

	test("should throw on store failure when throwOnErrors is true", async () => {
		const store = createStore();
		store.setMany = async () => {
			throw new Error("batch error");
		};
		const keyv = new Keyv({ store, throwOnErrors: true });
		keyv.on("error", () => {});
		await expect(
			keyv.setManyRaw([{ key: "a", value: { value: "test" } }]),
		).rejects.toThrow("batch error");
	});

	test("should emit error on failure", async () => {
		const store = createStore();
		store.setMany = async () => {
			throw new Error("batch error");
		};
		const keyv = new Keyv({ store });
		let errorEmitted = false;
		keyv.on("error", () => {
			errorEmitted = true;
		});
		const results = await keyv.setManyRaw([
			{ key: "a", value: { value: "test" } },
		]);
		expect(errorEmitted).toBe(true);
		expect(results).toEqual([false]);
	});

	test("should trigger PRE_SET_MANY_RAW and POST_SET_MANY_RAW hooks", async () => {
		const keyv = new Keyv();
		let preHookTriggered = false;
		let postHookTriggered = false;
		keyv.hooks.addHandler(KeyvHooks.PRE_SET_MANY_RAW, () => {
			preHookTriggered = true;
		});
		keyv.hooks.addHandler(KeyvHooks.POST_SET_MANY_RAW, () => {
			postHookTriggered = true;
		});
		await keyv.setManyRaw([
			{ key: faker.string.alphanumeric(10), value: { value: "test" } },
		]);
		expect(preHookTriggered).toBe(true);
		expect(postHookTriggered).toBe(true);
	});
});
