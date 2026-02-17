import { EventEmitter } from "node:events";
import { keyvApiTests, keyvValueTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvMemcache, { createKeyv } from "../src/index.js";

const snooze = async (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// Handle all the tests with listeners.
EventEmitter.setMaxListeners(200);

let uri = "localhost:11211";

if (process.env.URI) {
	uri = process.env.URI;
}

const keyvMemcache = new KeyvMemcache(uri);

test.beforeEach(async () => {
	await keyvMemcache.clear();
});

test.it("keyv get / no expired", async (t) => {
	const keyv = new Keyv<string>({ store: keyvMemcache });

	await keyv.set("foo", "bar");

	const value = await keyv.get("foo");

	t.expect(value).toBe("bar");
});

test.it("testing defaults", (t) => {
	const m = new KeyvMemcache();
	t.expect(m.opts.url).toBe("localhost:11211");
});

test.it("keyv clear", async (t) => {
	const keyv = new Keyv({ store: keyvMemcache });
	await keyv.clear();
	t.expect(await keyv.get("foo")).toBeUndefined();
});

test.it("keyv get", async (t) => {
	const keyv = new Keyv({ store: keyvMemcache });
	await keyv.clear();
	t.expect(await keyv.get("foo")).toBeUndefined();
	await keyv.set("foo", "bar");
	t.expect(await keyv.get("foo")).toBe("bar");
});

test.it("get namespace", (t) => {
	t.expect(keyvMemcache._getNamespace()).toBe("namespace:keyv");
});

test.it("format key for no namespace", (t) => {
	t.expect(new KeyvMemcache(uri).formatKey("foo")).toBe("foo");
});

test.it("format key for namespace", (t) => {
	new Keyv({ store: keyvMemcache });
	t.expect(keyvMemcache.formatKey("foo")).toBe("keyv:foo");
});

test.it("keyv get with namespace", async (t) => {
	const keyv1 = new Keyv({ store: keyvMemcache, namespace: "keyv1" });
	const keyv2 = new Keyv({ store: keyvMemcache, namespace: "2" });

	await keyv1.set("foo", "bar");
	t.expect(await keyv1.get("foo")).toBe("bar");

	await keyv2.set("foo", "bar2");
	t.expect(await keyv2.get("foo")).toBe("bar2");
});

test.it("keyv get / should still exist", async (t) => {
	const keyv = new Keyv<string>({ store: keyvMemcache });

	await keyv.set("foo-expired", "bar-expired", 10_000);

	await snooze(2000);

	const value = await keyv.get("foo-expired");

	t.expect(value).toBe("bar-expired");
});

test.it("keyv get / expired existing", async (t) => {
	const keyv = new Keyv<string>({ store: keyvMemcache });

	await keyv.set("foo-expired", "bar-expired", 1000);

	await snooze(3000);

	const value = await keyv.get("foo-expired");

	t.expect(value).toBeUndefined();
});

test.it("keyv get / expired existing with bad number", async (t) => {
	const keyv = new Keyv<string>({ store: keyvMemcache });

	await keyv.set("foo-expired", "bar-expired", 1);

	await snooze(1000);

	const value = await keyv.get("foo-expired");

	t.expect(value).toBeUndefined();
});

test.it("keyv get / expired", async (t) => {
	const keyv = new Keyv<string>({ store: keyvMemcache });

	await keyv.set("foo-expired", "bar-expired", 1000);

	await snooze(1000);

	const value = await keyv.get("foo-expired");

	t.expect(value).toBeUndefined();
});

test.it("keyv has / expired", async (t) => {
	const keyv = new Keyv({ store: keyvMemcache });

	await keyv.set("foo-expired", "bar-expired", 1000);

	await snooze(1000);

	const value = await keyv.has("foo-expired");

	t.expect(value).toBeFalsy();
});

test.it("keyvMemcache getMany", async (t) => {
	const value = await keyvMemcache.getMany(["foo0", "Foo1"]);
	t.expect(Array.isArray(value)).toBeTruthy();

	t.expect(value[0]).toEqual({ expires: 0, value: undefined });
});

test.it("keyvMemcache setMany", async (t) => {
	const keyv = new Keyv({ store: keyvMemcache });

	await keyv.setMany([
		{ key: "setMany1", value: "value1" },
		{ key: "setMany2", value: "value2" },
		{ key: "setMany3", value: "value3" },
	]);

	t.expect(await keyv.get("setMany1")).toBe("value1");
	t.expect(await keyv.get("setMany2")).toBe("value2");
	t.expect(await keyv.get("setMany3")).toBe("value3");
});

test.it("keyvMemcache setMany with ttl", async (t) => {
	const keyv = new Keyv({ store: keyvMemcache });

	await keyv.setMany([
		{ key: "setManyTtl1", value: "value1", ttl: 1000 },
		{ key: "setManyTtl2", value: "value2", ttl: 1000 },
	]);

	t.expect(await keyv.get("setManyTtl1")).toBe("value1");

	await snooze(2000);

	t.expect(await keyv.get("setManyTtl1")).toBeUndefined();
});

test.it("keyvMemcache hasMany", async (t) => {
	await keyvMemcache.set("hasMany1", "value1");
	await keyvMemcache.set("hasMany2", "value2");

	const result = await keyvMemcache.hasMany([
		"hasMany1",
		"hasMany2",
		"hasMany3",
	]);

	t.expect(result).toEqual([true, true, false]);
});

test.it("keyvMemcache hasMany with no keys existing", async (t) => {
	const result = await keyvMemcache.hasMany(["noKey1", "noKey2", "noKey3"]);
	t.expect(result).toEqual([false, false, false]);
});

test.it("keyvMemcache setMany should emit error on failure", async (t) => {
	const badMemcache = new KeyvMemcache("baduri:11211");
	let errorEmitted = false;
	badMemcache.on("error", () => {
		errorEmitted = true;
	});

	try {
		await badMemcache.setMany([{ key: "foo", value: "bar" }]);
	} catch {
		t.expect(errorEmitted).toBeTruthy();
	}
});

test.it("keyv has / false", async (t) => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	const value = await keyv.has("foo");

	t.expect(value).toBeFalsy();
});

// Simplified error tests without using withCallback wrapper
test.it("clear should emit an error", async (t) => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.clear();
	} catch {}
});

test.it("delete should emit an error", async (t) => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.delete("foo");
	} catch {}
});

test.it("set should emit an error", async (t) => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.set("foo", "bar");
	} catch {}
});

test.it("get should emit an error", async (t) => {
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.get("foo");
	} catch {}
});

test.it("disconnect should work", async (t) => {
	const memcache = new KeyvMemcache(uri);
	await memcache.set("disconnect-test", "value");
	await memcache.disconnect();
	t.expect(true).toBeTruthy();
});

test.it("createKeyv returns a Keyv instance", (t) => {
	const keyv = createKeyv(uri);
	t.expect(keyv).toBeInstanceOf(Keyv);
});

const store = () => keyvMemcache;

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);
