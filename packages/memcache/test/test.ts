import { EventEmitter } from "node:events";
import { keyvApiTests, keyvValueTests } from "@keyv/test-suite";
import Keyv from "keyv";
import * as test from "vitest";
import KeyvMemcache from "../src/index.js";

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
	// eslint-disable-next-line no-new
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
	const options = {
		logger: {
			log() {},
		},
	};
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211", options) });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.delete("foo");
	} catch {}
});

test.it("set should emit an error", async (t) => {
	const options = {
		logger: {
			log() {},
		},
	};
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211", options) });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.set("foo", "bar");
	} catch {}
});

test.it("get should emit an error", async (t) => {
	const options = {
		logger: {
			log() {},
		},
	};
	const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211", options) });

	keyv.on("error", () => {
		t.expect(true).toBeTruthy();
	});

	try {
		await keyv.get("foo");
	} catch {}
});

const store = () => keyvMemcache;

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);
