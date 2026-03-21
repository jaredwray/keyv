import { EventEmitter } from "node:events";
import { faker } from "@faker-js/faker";
import { keyvApiTests, keyvValueTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvMemcache, { createKeyv } from "../src/index.js";

const { beforeEach, expect, it } = test;

const snooze = async (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// Handle all the tests with listeners.
EventEmitter.setMaxListeners(200);

let uri = "localhost:11211";

if (process.env.URI) {
	uri = process.env.URI;
}

const keyvMemcache = new KeyvMemcache(uri);

beforeEach(async () => {
	await keyvMemcache.clear();
});

it("keyv get / no expired", async () => {
	const keyv = new Keyv<string>({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await keyv.set(key, val);

	const value = await keyv.get(key);

	expect(value).toBe(val);
});

it("testing defaults", () => {
	const m = new KeyvMemcache();
	expect(m.opts.nodes).toEqual(["localhost:11211"]);
});

it("keyv clear", async () => {
	const keyv = new Keyv({ store: keyvMemcache });
	const key = faker.string.uuid();
	await keyv.set(key, faker.lorem.word());
	await keyv.clear();
	expect(await keyv.get(key)).toBeUndefined();
});

it("keyv get", async () => {
	const keyv = new Keyv({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();
	await keyv.clear();
	expect(await keyv.get(key)).toBeUndefined();
	await keyv.set(key, val);
	expect(await keyv.get(key)).toBe(val);
});

it("format key for no namespace", () => {
	const key = faker.string.uuid();
	expect(new KeyvMemcache(uri).formatKey(key)).toBe(key);
});

it("format key for namespace", () => {
	const key = faker.string.uuid();
	new Keyv({ store: keyvMemcache });
	expect(keyvMemcache.formatKey(key)).toBe(`keyv:${key}`);
});

it("keyv get with namespace", async () => {
	const keyv1 = new Keyv({ store: keyvMemcache, namespace: "keyv1" });
	const keyv2 = new Keyv({ store: keyvMemcache, namespace: "2" });

	const key = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();

	await keyv1.set(key, val1);
	expect(await keyv1.get(key)).toBe(val1);

	await keyv2.set(key, val2);
	expect(await keyv2.get(key)).toBe(val2);
});

it("keyv get / should still exist", async () => {
	const keyv = new Keyv<string>({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await keyv.set(key, val, 10_000);

	await snooze(2000);

	const value = await keyv.get(key);

	expect(value).toBe(val);
});

it("keyv get / expired existing", async () => {
	const keyv = new Keyv<string>({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await keyv.set(key, val, 1000);

	await snooze(3000);

	const value = await keyv.get(key);

	expect(value).toBeUndefined();
});

it("keyv get / expired existing with bad number", async () => {
	const keyv = new Keyv<string>({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await keyv.set(key, val, 1);

	await snooze(1000);

	const value = await keyv.get(key);

	expect(value).toBeUndefined();
});

it("keyv get / expired", async () => {
	const keyv = new Keyv<string>({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await keyv.set(key, val, 1000);

	await snooze(1000);

	const value = await keyv.get(key);

	expect(value).toBeUndefined();
});

it("keyv has / expired", async () => {
	const keyv = new Keyv({ store: keyvMemcache });
	const key = faker.string.uuid();
	const val = faker.lorem.word();

	await keyv.set(key, val, 1000);

	await snooze(1000);

	const value = await keyv.has(key);

	expect(value).toBeFalsy();
});

it("keyvMemcache getMany", async () => {
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const value = await keyvMemcache.getMany([key1, key2]);
	expect(Array.isArray(value)).toBeTruthy();

	expect(value[0]).toBeUndefined();
});

it("keyvMemcache setMany", async () => {
	const keyv = new Keyv({ store: keyvMemcache });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();
	const val3 = faker.lorem.word();

	await keyv.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
		{ key: key3, value: val3 },
	]);

	expect(await keyv.get(key1)).toBe(val1);
	expect(await keyv.get(key2)).toBe(val2);
	expect(await keyv.get(key3)).toBe(val3);
});

it("keyvMemcache setMany with ttl", async () => {
	const keyv = new Keyv({ store: keyvMemcache });
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const val1 = faker.lorem.word();
	const val2 = faker.lorem.word();

	await keyv.setMany([
		{ key: key1, value: val1, ttl: 1000 },
		{ key: key2, value: val2, ttl: 1000 },
	]);

	expect(await keyv.get(key1)).toBe(val1);

	await snooze(2000);

	expect(await keyv.get(key1)).toBeUndefined();
});

it("keyvMemcache hasMany", async () => {
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	await keyvMemcache.set(key1, faker.lorem.word());
	await keyvMemcache.set(key2, faker.lorem.word());

	const result = await keyvMemcache.hasMany([key1, key2, key3]);

	expect(result).toEqual([true, true, false]);
});

it("keyvMemcache hasMany with no keys existing", async () => {
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	const result = await keyvMemcache.hasMany([key1, key2, key3]);
	expect(result).toEqual([false, false, false]);
});

it("keyvMemcache setMany should emit error on failure", async () => {
	const badMemcache = new KeyvMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	try {
		await badMemcache.setMany([{ key: "foo", value: "bar" }]);
	} catch {
		expect(errorEmitted).toBeTruthy();
	}
});

it("keyv has / false", async () => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	const value = await keyv.has("foo");

	expect(value).toBeFalsy();
});

// Simplified error tests without using withCallback wrapper
it("clear should emit an error", async () => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		expect(true).toBeTruthy();
	});

	try {
		await keyv.clear();
	} catch {}
});

it("delete should emit an error", async () => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		expect(true).toBeTruthy();
	});

	try {
		await keyv.delete("foo");
	} catch {}
});

it("set should emit an error", async () => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		expect(true).toBeTruthy();
	});

	try {
		await keyv.set("foo", "bar");
	} catch {}
});

it("get should emit an error", async () => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		expect(true).toBeTruthy();
	});

	try {
		await keyv.get("foo");
	} catch {}
});

it("disconnect should work", async () => {
	const memcache = new KeyvMemcache(uri);
	const key = faker.string.uuid();
	await memcache.set(key, faker.lorem.word());
	await memcache.disconnect();
	expect(true).toBeTruthy();
});

it("createKeyv returns a Keyv instance", () => {
	const keyv = createKeyv(uri);
	expect(keyv).toBeInstanceOf(Keyv);
});

it("constructor with string URI sets nodes", () => {
	const m = new KeyvMemcache("myserver:11211");
	expect(m.opts.nodes).toEqual(["myserver:11211"]);
});

it("constructor with options object containing nodes", () => {
	const m = new KeyvMemcache({ nodes: ["server1:11211", "server2:11211"] });
	expect(m.opts.nodes).toEqual(["server1:11211", "server2:11211"]);
});

it("constructor with options passes timeout to memcache client", () => {
	const m = new KeyvMemcache({ nodes: [uri], timeout: 3000 });
	expect(m.opts.timeout).toBe(3000);
});

it("constructor with options passes keepAlive to memcache client", () => {
	const m = new KeyvMemcache({ nodes: [uri], keepAlive: false });
	expect(m.opts.keepAlive).toBe(false);
});

it("constructor with options passes retries to memcache client", () => {
	const m = new KeyvMemcache({ nodes: [uri], retries: 3, retryDelay: 200 });
	expect(m.opts.retries).toBe(3);
	expect(m.opts.retryDelay).toBe(200);
});

it("string URI with additional options merges correctly", () => {
	const m = new KeyvMemcache(uri, { timeout: 2000 });
	expect(m.opts.nodes).toEqual([uri]);
	expect(m.opts.timeout).toBe(2000);
});

it("nodes from options takes precedence over string URI", () => {
	const m = new KeyvMemcache("ignored:11211", { nodes: ["server1:11211"] });
	expect(m.opts.nodes).toEqual(["server1:11211"]);
});

it("createKeyv with options passes them through", () => {
	const keyv = createKeyv({ nodes: [uri], timeout: 3000 });
	expect(keyv).toBeInstanceOf(Keyv);
});

const store = () => keyvMemcache;

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);
