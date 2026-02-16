import { faker } from "@faker-js/faker";
import * as test from "vitest";
import Keyv, { KeyvHooks, type KeyvStoreAdapter } from "../src/index.js";

// In-memory store adapter with getMany support
const createStore = () => {
	const map = new Map<string, unknown>();
	const store = {
		opts: { dialect: "", url: "" },
		namespace: undefined as string | undefined,
		async get(key: string) {
			return map.get(key);
		},
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		async set(key: string, value: any, _ttl?: number) {
			map.set(key, value);
		},
		async delete(key: string) {
			return map.delete(key);
		},
		async clear() {
			map.clear();
		},
		async getMany(keys: string[]) {
			return keys.map((key) => map.get(key));
		},
		on() {
			return store;
		},
	} as unknown as KeyvStoreAdapter;
	return store;
};

test.it("PRE_SET hook", async (t) => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_SET, (data) => {
		t.expect(data.key).toBe("foo");
		t.expect(data.value).toBe("bar");
	});
	t.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.set("foo", "bar");
});

test.it("PRE_SET hook with manipulation", async (t) => {
	const keyId = faker.string.alphanumeric(10);
	const newKeyId = `${keyId}1`;
	const keyValue = faker.lorem.sentence();
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_SET, (data) => {
		data.key = newKeyId;
	});
	t.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.set(keyId, keyValue);

	const value = await keyv.get(newKeyId);
	t.expect(value).toBe(keyValue);
});

test.it("POST_SET hook", async (t) => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_SET, (data) => {
		t.expect(data.key).toBe("keyv:foo");
		t.expect(data.value).toBe('{"value":"bar","expires":null}');
	});
	t.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.set("foo", "bar");
});

test.it("PRE_GET_MANY hook", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	keyv.hooks.addHandler(KeyvHooks.PRE_GET_MANY, (data) => {
		test.expect(data.keys[0]).toBe("keyv:foo");
		test.expect(data.keys[1]).toBe("keyv:foo1");
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.get(keys);
});

test.it("PRE_GET_MANY with manipulation", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	keyv.hooks.addHandler(KeyvHooks.PRE_GET_MANY, (data) => {
		test.expect(data.keys[0]).toBe("keyv:foo");
		test.expect(data.keys[1]).toBe("keyv:foo1");

		data.keys[0] = "keyv:fake";
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const values = await keyv.get(keys);
	test.expect(values[0]).toBeUndefined();
});

test.it("POST_GET_MANY with no getMany function", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	keyv.hooks.addHandler(KeyvHooks.POST_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.get(keys);
});

test.it("POST_GET_MANY with manipulation", async () => {
	const keyv = new Keyv();
	const keys = ["foo", "foo1"];
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	keyv.hooks.addHandler(KeyvHooks.POST_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
		data[1] = "fake";
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const values = await keyv.get(keys);
	test.expect(values[1]).toBe("fake");
});

test.it("POST_GET_MANY with getMany function", async () => {
	const keyv = new Keyv({ store: createStore() });
	const keys = ["foo", "foo1"];
	await keyv.set("foo", "bar");
	await keyv.set("foo1", "bar1");
	keyv.hooks.addHandler(KeyvHooks.POST_GET_MANY, (data) => {
		test.expect(data[0]).toBe("bar");
		test.expect(data[1]).toBe("bar1");
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.get(keys);
});

test.it("PRE_DELETE hook", async () => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_DELETE, (data) => {
		test.expect(data.key).toBe("keyv:foo");
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.delete("foo");
});

test.it("POST_DELETE hook", async () => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_DELETE, (data) => {
		test.expect(data).toBeTruthy();
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.delete("foo");
});

test.it("PRE_GET hook", async () => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_GET, (data) => {
		test.expect(data.key).toBe("keyv:foo");
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	await keyv.set("foo", "bar");
	await keyv.get("foo");
});

test.it("POST_GET hook on cache hit", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	keyv.hooks.addHandler(KeyvHooks.POST_GET, (data) => {
		test.expect(data.key).toBe("keyv:foo");
		test.expect(data.value).toEqual({ value: "bar" });
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const value = await keyv.get("foo");
	test.expect(value).toBe("bar");
});

test.it("POST_GET hook on cache miss", async () => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_GET, (data) => {
		test.expect(data.key).toBe("keyv:nonexistent");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const value = await keyv.get("nonexistent");
	test.expect(value).toBeUndefined();
});

test.it("POST_GET hook on expired key", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar", 1); // expires in 1ms
	await new Promise((resolve) => setTimeout(resolve, 10)); // wait 10ms
	keyv.hooks.addHandler(KeyvHooks.POST_GET, (data) => {
		test.expect(data.key).toBe("keyv:foo");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const value = await keyv.get("foo");
	test.expect(value).toBeUndefined();
});

test.it("POST_GET_RAW hook on cache hit", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar");
	keyv.hooks.addHandler(KeyvHooks.POST_GET_RAW, (data) => {
		test.expect(data.key).toBe("keyv:foo");
		test.expect(data.value).toEqual({ value: "bar" });
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const value = await keyv.getRaw("foo");
	test.expect(value).toEqual({ value: "bar" });
});

test.it("POST_GET_RAW hook on cache miss", async () => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_GET_RAW, (data) => {
		test.expect(data.key).toBe("keyv:nonexistent");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const value = await keyv.getRaw("nonexistent");
	test.expect(value).toBeUndefined();
});

test.it("POST_GET_RAW hook on expired key", async () => {
	const keyv = new Keyv();
	await keyv.set("foo", "bar", 1); // expires in 1ms
	await new Promise((resolve) => setTimeout(resolve, 10)); // wait 10ms
	keyv.hooks.addHandler(KeyvHooks.POST_GET_RAW, (data) => {
		test.expect(data.key).toBe("keyv:foo");
		test.expect(data.value).toBeUndefined();
	});
	test.expect(keyv.hooks.handlers.size).toBe(1);
	const value = await keyv.getRaw("foo");
	test.expect(value).toBeUndefined();
});
