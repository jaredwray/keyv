import { faker } from "@faker-js/faker";
import { describe, expect, test } from "vitest";
import Keyv, { KeyvHooks } from "../src/index.js";
import { createStore, delay } from "./test-utils.js";

describe("hooks", () => {
	test("BEFORE_SET hook", async () => {
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.BEFORE_SET, (data) => {
			expect(data.key).toBe("foo");
			expect(data.value).toBe("bar");
		});
		expect(keyv.getHooks(KeyvHooks.BEFORE_SET)?.length).toBe(1);
		await keyv.set("foo", "bar");
	});

	test("BEFORE_SET hook with manipulation", async () => {
		const keyId = faker.string.alphanumeric(10);
		const newKeyId = `${keyId}1`;
		const keyValue = faker.lorem.sentence();
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.BEFORE_SET, (data) => {
			data.key = newKeyId;
		});
		await keyv.set(keyId, keyValue);
		expect(await keyv.get(newKeyId)).toBe(keyValue);
	});

	test("AFTER_SET hook", async () => {
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.AFTER_SET, (data) => {
			expect(data.key).toBe("foo");
			expect(data.value).toBe('{"value":"bar"}');
		});
		await keyv.set("foo", "bar");
	});

	test("BEFORE_GET_MANY and manipulation", async () => {
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.BEFORE_GET_MANY, (data) => {
			expect(data.keys[0]).toBe("foo");
			expect(data.keys[1]).toBe("foo1");
			data.keys[0] = "fake";
		});
		expect(keyv.getHooks(KeyvHooks.BEFORE_GET_MANY)?.length).toBe(1);
		const values = await keyv.get(["foo", "foo1"]);
		expect(values[0]).toBeUndefined();
	});

	test("AFTER_GET_MANY with and without getMany function", async () => {
		// Without getMany
		const keyv = new Keyv();
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		keyv.addHook(KeyvHooks.AFTER_GET_MANY, (data) => {
			expect(data[0]).toBe("bar");
			expect(data[1]).toBe("bar1");
		});
		await keyv.get(["foo", "foo1"]);

		// With getMany and manipulation
		const keyv2 = new Keyv({ store: createStore() });
		await keyv2.set("foo", "bar");
		await keyv2.set("foo1", "bar1");
		keyv2.addHook(KeyvHooks.AFTER_GET_MANY, (data) => {
			data[1] = "fake";
		});
		const values = await keyv2.get(["foo", "foo1"]);
		expect(values[1]).toBe("fake");
	});

	test("BEFORE_DELETE and AFTER_DELETE hooks", async () => {
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.BEFORE_DELETE, (data) => {
			expect(data.key).toBe("foo");
		});
		keyv.addHook(KeyvHooks.AFTER_DELETE, (data) => {
			expect(data).toBeTruthy();
		});
		await keyv.set("foo", "bar");
		await keyv.delete("foo");
	});

	test("BEFORE_GET hook", async () => {
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.BEFORE_GET, (data) => {
			expect(data.key).toBe("foo");
		});
		await keyv.set("foo", "bar");
		await keyv.get("foo");
	});

	test("AFTER_GET hook on hit, miss, and expired", async () => {
		const keyv = new Keyv();
		await keyv.set("foo", "bar");

		// Hit
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let hookData: any;
		keyv.addHook(KeyvHooks.AFTER_GET, (data) => {
			hookData = data;
		});
		await keyv.get("foo");
		expect(hookData.key).toBe("foo");
		expect(hookData.value).toEqual({ value: "bar" });

		// Miss
		await keyv.get("nonexistent");
		expect(hookData.key).toBe("nonexistent");
		expect(hookData.value).toBeUndefined();

		// Expired
		await keyv.set("exp", "val", 1);
		await delay(10);
		await keyv.get("exp");
		expect(hookData.key).toBe("exp");
		expect(hookData.value).toBeUndefined();
	});

	test("AFTER_GET_RAW hook on hit, miss, and expired", async () => {
		const keyv = new Keyv();
		await keyv.set("foo", "bar");

		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let hookData: any;
		keyv.addHook(KeyvHooks.AFTER_GET_RAW, (data) => {
			hookData = data;
		});

		await keyv.getRaw("foo");
		expect(hookData.key).toBe("foo");
		expect(hookData.value).toEqual({ value: "bar" });

		await keyv.getRaw("nonexistent");
		expect(hookData.value).toBeUndefined();

		await keyv.set("exp", "val", 1);
		await delay(10);
		await keyv.getRaw("exp");
		expect(hookData.value).toBeUndefined();
	});

	test("deprecated hooks (PRE_SET, POST_SET, PRE_GET, POST_DELETE) still fire", async () => {
		const keyv = new Keyv();
		keyv.on("warn", () => {});
		const fired: string[] = [];
		keyv.addHook(KeyvHooks.PRE_SET, () => {
			fired.push("PRE_SET");
		});
		keyv.addHook(KeyvHooks.POST_SET, () => {
			fired.push("POST_SET");
		});
		keyv.addHook(KeyvHooks.PRE_GET, () => {
			fired.push("PRE_GET");
		});
		keyv.addHook(KeyvHooks.POST_DELETE, () => {
			fired.push("POST_DELETE");
		});
		await keyv.set("foo", "bar");
		await keyv.get("foo");
		await keyv.delete("foo");
		expect(fired).toEqual(["PRE_SET", "POST_SET", "PRE_GET", "POST_DELETE"]);
	});

	test("BEFORE_SET_MANY and AFTER_SET_MANY hooks with manipulation", async () => {
		const keyv = new Keyv();
		keyv.addHook(KeyvHooks.BEFORE_SET_MANY, (data) => {
			expect(data.entries).toHaveLength(2);
			data.entries[0].value = "modified";
		});
		keyv.addHook(KeyvHooks.AFTER_SET_MANY, (data) => {
			expect(data.entries).toHaveLength(2);
			expect(data.values).toEqual([true, true]);
		});
		await keyv.setMany([
			{ key: "foo", value: "bar" },
			{ key: "foo1", value: "bar1" },
		]);
		const values = await keyv.get(["foo", "foo1"]);
		expect(values[0]).toBe("modified");
		expect(values[1]).toBe("bar1");
	});

	test("BEFORE_DELETE_MANY, AFTER_DELETE_MANY, and legacy hooks for deleteMany", async () => {
		const keyv = new Keyv();
		const fired: string[] = [];
		keyv.addHook(KeyvHooks.BEFORE_DELETE_MANY, (data) => {
			expect(data.keys).toEqual(["foo", "foo1"]);
			fired.push("BEFORE_DELETE_MANY");
		});
		keyv.addHook(KeyvHooks.AFTER_DELETE_MANY, (data) => {
			expect(data.values).toEqual([true, true]);
			fired.push("AFTER_DELETE_MANY");
		});
		keyv.addHook(KeyvHooks.BEFORE_DELETE, () => {
			fired.push("BEFORE_DELETE");
		});
		keyv.addHook(KeyvHooks.AFTER_DELETE, () => {
			fired.push("AFTER_DELETE");
		});
		await keyv.set("foo", "bar");
		await keyv.set("foo1", "bar1");
		await keyv.delete(["foo", "foo1"]);
		expect(fired).toContain("BEFORE_DELETE_MANY");
		expect(fired).toContain("AFTER_DELETE_MANY");
		expect(fired).toContain("BEFORE_DELETE");
		expect(fired).toContain("AFTER_DELETE");
	});

	test("BEFORE_CLEAR and AFTER_CLEAR hooks with namespace", async () => {
		const keyv = new Keyv({ namespace: "test-ns" });
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let beforeData: any;
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let afterData: any;
		let valueBeforeClear: string | undefined;
		keyv.addHook(KeyvHooks.BEFORE_CLEAR, async (data) => {
			beforeData = data;
			valueBeforeClear = await keyv.get("foo");
		});
		keyv.addHook(KeyvHooks.AFTER_CLEAR, (data) => {
			afterData = data;
		});
		await keyv.set("foo", "bar");
		await keyv.clear();
		expect(beforeData.namespace).toBe("test-ns");
		expect(afterData.namespace).toBe("test-ns");
		expect(valueBeforeClear).toBe("bar");

		// Without namespace
		const keyv2 = new Keyv();
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let ns: any;
		keyv2.addHook(KeyvHooks.BEFORE_CLEAR, (data) => {
			ns = data.namespace;
		});
		await keyv2.clear();
		expect(ns).toBeUndefined();
	});

	test("BEFORE_DISCONNECT and AFTER_DISCONNECT hooks with namespace", async () => {
		const keyv = new Keyv({ namespace: "test-ns" });
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let beforeData: any;
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let afterData: any;
		keyv.addHook(KeyvHooks.BEFORE_DISCONNECT, (data) => {
			beforeData = data;
		});
		keyv.addHook(KeyvHooks.AFTER_DISCONNECT, (data) => {
			afterData = data;
		});
		await keyv.disconnect();
		expect(beforeData.namespace).toBe("test-ns");
		expect(afterData.namespace).toBe("test-ns");

		// Without namespace
		const keyv2 = new Keyv();
		// biome-ignore lint/suspicious/noExplicitAny: test hook data
		let ns: any;
		keyv2.addHook(KeyvHooks.BEFORE_DISCONNECT, (data) => {
			ns = data.namespace;
		});
		await keyv2.disconnect();
		expect(ns).toBeUndefined();
	});
});
