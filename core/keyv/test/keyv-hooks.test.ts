import { faker } from "@faker-js/faker";
import * as test from "vitest";
import Keyv, { KeyvHooks } from "../src/index.js";
import { createStore, delay } from "./test-utils.js";

test.it("BEFORE_SET hook", async (t) => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_SET, (data) => {
		t.expect(data.key).toBe("foo");
		t.expect(data.value).toBe("bar");
	});
	t.expect(keyv.getHooks(KeyvHooks.BEFORE_SET)?.length).toBe(1);
	await keyv.set("foo", "bar");
});

test.it("BEFORE_SET hook with manipulation", async (t) => {
	const keyId = faker.string.alphanumeric(10);
	const newKeyId = `${keyId}1`;
	const keyValue = faker.lorem.sentence();
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_SET, (data) => {
		data.key = newKeyId;
	});
	t.expect(keyv.getHooks(KeyvHooks.BEFORE_SET)?.length).toBe(1);
	await keyv.set(keyId, keyValue);

	const value = await keyv.get(newKeyId);
	t.expect(value).toBe(keyValue);
});

test.it("AFTER_SET hook", async (t) => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.AFTER_SET, (data) => {
		t.expect(data.key).toBe("foo");
		t.expect(data.value).toBe('{"value":"bar"}');
	});
	t.expect(keyv.getHooks(KeyvHooks.AFTER_SET)?.length).toBe(1);
	await keyv.set("foo", "bar");
});

test.it("BEFORE_GET_MANY hook", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	keyv.addHook(KeyvHooks.BEFORE_GET_MANY, (data) => {
		test.expect(data.keys[0]).toBe("foo");
		test.expect(data.keys[1]).toBe("foo1");
	});
	test.expect(keyv.getHooks(KeyvHooks.BEFORE_GET_MANY)?.length).toBe(1);
	await keyv.get(keys);
});

test.it("BEFORE_GET_MANY with manipulation", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	keyv.addHook(KeyvHooks.BEFORE_GET_MANY, (data) => {
		test.expect(data.keys[0]).toBe("foo");
		test.expect(data.keys[1]).toBe("foo1");

		data.keys[0] = "fake";
	});
	test.expect(keyv.getHooks(KeyvHooks.BEFORE_GET_MANY)?.length).toBe(1);
	const values = await keyv.get(keys);
	test.expect(values[0]).toBeUndefined();
});

test.it("AFTER_GET_MANY with no getMany function", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	keyv.addHook(KeyvHooks.AFTER_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET_MANY)?.length).toBe(1);
	await keyv.get(keys);
});

test.it("AFTER_GET_MANY with manipulation", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	keyv.addHook(KeyvHooks.AFTER_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
		data[1] = "fake";
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET_MANY)?.length).toBe(1);
	const values = await keyv.get(keys);
	test.expect(values[1]).toBe("fake");
});

test.it("AFTER_GET_MANY with getMany function", async () => {
	const keyv = new Keyv({ store: createStore() });
	const keys = ["foo", "foo1"];
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	keyv.addHook(KeyvHooks.AFTER_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET_MANY)?.length).toBe(1);
	await keyv.get(keys);
});

test.it("BEFORE_DELETE hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_DELETE, (data) => {
		test.expect(data.key).toBe("foo");
	});
	test.expect(keyv.getHooks(KeyvHooks.BEFORE_DELETE)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.delete("foo");
});

test.it("AFTER_DELETE hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.AFTER_DELETE, (data) => {
		test.expect(data).toBeTruthy();
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_DELETE)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.delete("foo");
});

test.it("BEFORE_GET hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_GET, (data) => {
		test.expect(data.key).toBe("foo");
	});
	test.expect(keyv.getHooks(KeyvHooks.BEFORE_GET)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.get("foo");
});

test.it("AFTER_GET hook on cache hit", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	keyv.addHook(KeyvHooks.AFTER_GET, (data) => {
		test.expect(data.key).toBe("foo");
		test.expect(data.value).toEqual({ value: "bar" });
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET)?.length).toBe(1);
	const value = await keyv.get("foo");
	test.expect(value).toBe("bar");
});

test.it("AFTER_GET hook on cache miss", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.AFTER_GET, (data) => {
		test.expect(data.key).toBe("nonexistent");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET)?.length).toBe(1);
	const value = await keyv.get("nonexistent");
	test.expect(value).toBeUndefined();
});

test.it("AFTER_GET hook on expired key", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar", 1); // expires in 1ms
	await delay(10); // wait 10ms
	keyv.addHook(KeyvHooks.AFTER_GET, (data) => {
		test.expect(data.key).toBe("foo");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET)?.length).toBe(1);
	const value = await keyv.get("foo");
	test.expect(value).toBeUndefined();
});

test.it("AFTER_GET_RAW hook on cache hit", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	keyv.addHook(KeyvHooks.AFTER_GET_RAW, (data) => {
		test.expect(data.key).toBe("foo");
		test.expect(data.value).toEqual({ value: "bar" });
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET_RAW)?.length).toBe(1);
	const value = await keyv.getRaw("foo");
	test.expect(value).toEqual({ value: "bar" });
});

test.it("AFTER_GET_RAW hook on cache miss", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.AFTER_GET_RAW, (data) => {
		test.expect(data.key).toBe("nonexistent");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET_RAW)?.length).toBe(1);
	const value = await keyv.getRaw("nonexistent");
	test.expect(value).toBeUndefined();
});

test.it("AFTER_GET_RAW hook on expired key", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar", 1); // expires in 1ms
	await delay(10); // wait 10ms
	keyv.addHook(KeyvHooks.AFTER_GET_RAW, (data) => {
		test.expect(data.key).toBe("foo");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_GET_RAW)?.length).toBe(1);
	const value = await keyv.getRaw("foo");
	test.expect(value).toBeUndefined();
});

test.it("deprecated PRE_SET hook still fires when using BEFORE_SET internally", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.on("warn", () => {}); // Silence deprecation warnings
	keyv.addHook(KeyvHooks.PRE_SET, (data) => {
		hookTriggered = true;
		t.expect(data.key).toBe("foo");
		t.expect(data.value).toBe("bar");
	});
	await keyv.set("foo", "bar");
	t.expect(hookTriggered).toBe(true);
});

test.it("deprecated POST_SET hook still fires when using AFTER_SET internally", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.on("warn", () => {}); // Silence deprecation warnings
	keyv.addHook(KeyvHooks.POST_SET, (data) => {
		hookTriggered = true;
		t.expect(data.key).toBe("foo");
	});
	await keyv.set("foo", "bar");
	t.expect(hookTriggered).toBe(true);
});

test.it("deprecated PRE_GET hook still fires", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.on("warn", () => {}); // Silence deprecation warnings
	keyv.addHook(KeyvHooks.PRE_GET, (data) => {
		hookTriggered = true;
		t.expect(data.key).toBe("foo");
	});
	await keyv.set("foo", "bar");
	await keyv.get("foo");
	t.expect(hookTriggered).toBe(true);
});

test.it("deprecated POST_DELETE hook still fires", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.on("warn", () => {}); // Silence deprecation warnings
	keyv.addHook(KeyvHooks.POST_DELETE, () => {
		hookTriggered = true;
	});
	await keyv.set("foo", "bar");
	await keyv.delete("foo");
	t.expect(hookTriggered).toBe(true);
});

test.it("BEFORE_SET_MANY hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_SET_MANY, (data) => {
		test.expect(data.entries).toHaveLength(2);
		test.expect(data.entries[0].key).toBe("foo");
		test.expect(data.entries[0].value).toBe("bar");
		test.expect(data.entries[1].key).toBe("foo1");
		test.expect(data.entries[1].value).toBe("bar1");
	});
	test.expect(keyv.getHooks(KeyvHooks.BEFORE_SET_MANY)?.length).toBe(1);
	await keyv.setMany([
		{ key: "foo", value: "bar" },
		{ key: "foo1", value: "bar1" },
	]);
});

test.it("BEFORE_SET_MANY hook with manipulation", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_SET_MANY, (data) => {
		data.entries[0].value = "modified";
	});
	await keyv.setMany([
		{ key: "foo", value: "bar" },
		{ key: "foo1", value: "bar1" },
	]);
	const values = await keyv.get(["foo", "foo1"]);
	test.expect(values[0]).toBe("modified");
	test.expect(values[1]).toBe("bar1");
});

test.it("AFTER_SET_MANY hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.AFTER_SET_MANY, (data) => {
		test.expect(data.entries).toHaveLength(2);
		test.expect(data.values).toHaveLength(2);
		test.expect(data.values[0]).toBe(true);
		test.expect(data.values[1]).toBe(true);
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_SET_MANY)?.length).toBe(1);
	await keyv.setMany([
		{ key: "foo", value: "bar" },
		{ key: "foo1", value: "bar1" },
	]);
});

test.it("BEFORE_DELETE_MANY hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.BEFORE_DELETE_MANY, (data) => {
		test.expect(data.keys).toEqual(["foo", "foo1"]);
	});
	test.expect(keyv.getHooks(KeyvHooks.BEFORE_DELETE_MANY)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.delete(["foo", "foo1"]);
});

test.it("AFTER_DELETE_MANY hook", async () => {
	const keyv = new Keyv();
	keyv.addHook(KeyvHooks.AFTER_DELETE_MANY, (data) => {
		test.expect(data.keys).toEqual(["foo", "foo1"]);
		test.expect(data.values).toEqual([true, true]);
	});
	test.expect(keyv.getHooks(KeyvHooks.AFTER_DELETE_MANY)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.delete(["foo", "foo1"]);
});

test.it("deleteMany still fires legacy BEFORE_DELETE and AFTER_DELETE hooks", async (t) => {
	const keyv = new Keyv();
	let beforeFired = false;
	let afterFired = false;
	keyv.addHook(KeyvHooks.BEFORE_DELETE, (data) => {
		beforeFired = true;
		t.expect(data.key).toEqual(["foo", "foo1"]);
	});
	keyv.addHook(KeyvHooks.AFTER_DELETE, (data) => {
		afterFired = true;
		t.expect(data.key).toEqual(["foo", "foo1"]);
		t.expect(data.value).toEqual([true, true]);
	});
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	await keyv.delete(["foo", "foo1"]);
	t.expect(beforeFired).toBe(true);
	t.expect(afterFired).toBe(true);
});

test.it("BEFORE_CLEAR hook", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.addHook(KeyvHooks.BEFORE_CLEAR, () => {
		hookTriggered = true;
	});
	t.expect(keyv.getHooks(KeyvHooks.BEFORE_CLEAR)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.clear();
	t.expect(hookTriggered).toBe(true);
});

test.it("AFTER_CLEAR hook", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.addHook(KeyvHooks.AFTER_CLEAR, () => {
		hookTriggered = true;
	});
	t.expect(keyv.getHooks(KeyvHooks.AFTER_CLEAR)?.length).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.clear();
	t.expect(hookTriggered).toBe(true);
});

test.it("BEFORE_CLEAR fires before store is cleared", async (t) => {
	const keyv = new Keyv();
	let valueBeforeClear: string | undefined;
	keyv.addHook(KeyvHooks.BEFORE_CLEAR, async () => {
		valueBeforeClear = await keyv.get("foo");
	});
	await keyv.set("foo", "bar");
	await keyv.clear();
	t.expect(valueBeforeClear).toBe("bar");
});

test.it("BEFORE_DISCONNECT hook", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.addHook(KeyvHooks.BEFORE_DISCONNECT, () => {
		hookTriggered = true;
	});
	t.expect(keyv.getHooks(KeyvHooks.BEFORE_DISCONNECT)?.length).toBe(1);
	await keyv.disconnect();
	t.expect(hookTriggered).toBe(true);
});

test.it("AFTER_DISCONNECT hook", async (t) => {
	const keyv = new Keyv();
	let hookTriggered = false;
	keyv.addHook(KeyvHooks.AFTER_DISCONNECT, () => {
		hookTriggered = true;
	});
	t.expect(keyv.getHooks(KeyvHooks.AFTER_DISCONNECT)?.length).toBe(1);
	await keyv.disconnect();
	t.expect(hookTriggered).toBe(true);
});
