import { faker } from "@faker-js/faker";
import { KeyvSqlite } from "@keyv/sqlite";
import * as test from "vitest";
import Keyv, { KeyvHooks } from "../src/index.js";

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
	const keyvSqlite = new KeyvSqlite({ uri: "sqlite://test.db" });
	const keyv = new Keyv({ store: keyvSqlite });
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
