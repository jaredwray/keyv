import { EventEmitter } from "node:events";
import { faker } from "@faker-js/faker";
import { delay, keyvApiTests, keyvValueTests, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvMemcache, { createKeyv } from "../src/index.js";

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

describe("constructor", () => {
	test("defaults to localhost:11211 when no uri is provided", () => {
		const store = new KeyvMemcache();
		expect(store.nodes).toEqual(["localhost:11211"]);
	});

	test("sets nodes from a string uri", () => {
		const store = new KeyvMemcache("myserver:11211");
		expect(store.nodes).toEqual(["myserver:11211"]);
	});

	test("sets nodes from an options object", () => {
		const store = new KeyvMemcache({ nodes: ["server1:11211", "server2:11211"] });
		expect(store.nodes).toEqual(["server1:11211", "server2:11211"]);
	});

	test("passes timeout through to the memcache client", () => {
		const store = new KeyvMemcache({ nodes: [uri], timeout: 3000 });
		expect(store.timeout).toBe(3000);
	});

	test("passes keepAlive through to the memcache client", () => {
		const store = new KeyvMemcache({ nodes: [uri], keepAlive: false });
		expect(store.keepAlive).toBe(false);
	});

	test("passes retries and retryDelay through to the memcache client", () => {
		const store = new KeyvMemcache({ nodes: [uri], retries: 3, retryDelay: 200 });
		expect(store.retries).toBe(3);
		expect(store.retryDelay).toBe(200);
	});

	test("merges a string uri with an additional options object", () => {
		const store = new KeyvMemcache(uri, { timeout: 2000 });
		expect(store.nodes).toEqual([uri]);
		expect(store.timeout).toBe(2000);
	});

	test("prefers nodes from options over the string uri", () => {
		const store = new KeyvMemcache("ignored:11211", { nodes: ["server1:11211"] });
		expect(store.nodes).toEqual(["server1:11211"]);
	});
});

describe("get", () => {
	test("returns undefined for a key that does not exist", async () => {
		const keyv = new Keyv({ store: keyvMemcache });
		const key = faker.string.uuid();
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("returns a previously set value", async () => {
		const keyv = new Keyv<string>({ store: keyvMemcache });
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, value);
		expect(await keyv.get(key)).toBe(value);
	});

	test("returns the value directly from the adapter", async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyvMemcache.set(key, value);
		expect(await keyvMemcache.get(key)).toBe(value);
	});

	test("returns undefined for a missing key from the adapter", async () => {
		expect(await keyvMemcache.get(faker.string.uuid())).toBeUndefined();
	});

	test("returns the raw value the server stores", async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		// The adapter stores the value verbatim, with no envelope wrapping.
		await keyvMemcache.set(key, value);
		expect(await keyvMemcache.client.get(keyvMemcache.formatKey(key))).toBe(value);
		expect(await keyvMemcache.get(key)).toBe(value);
	});
});

describe("getMany", () => {
	test("returns undefined for keys that do not exist", async () => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const values = await keyvMemcache.getMany([key1, key2]);
		expect(Array.isArray(values)).toBe(true);
		expect(values).toEqual([undefined, undefined]);
	});

	test("returns values in the same order as the keys", async () => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await keyvMemcache.set(key1, val1);
		await keyvMemcache.set(key2, val2);
		const values = await keyvMemcache.getMany([key1, key2]);
		expect(values).toEqual([val1, val2]);
	});
});

describe("set and setMany", () => {
	test("sets many values that can be read back", async () => {
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

	test("sets many values with a per-entry ttl", async () => {
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

		await delay(2000);

		expect(await keyv.get(key1)).toBeUndefined();
	});
});

describe("has", () => {
	test("returns true for an existing key and false for a missing one", async () => {
		const keyv = new Keyv({ store: keyvMemcache });
		const key = faker.string.uuid();
		await keyv.set(key, faker.lorem.word());
		expect(await keyv.has(key)).toBe(true);
		expect(await keyv.has(faker.string.uuid())).toBe(false);
	});
});

describe("clear", () => {
	test("removes all stored values", async () => {
		const keyv = new Keyv({ store: keyvMemcache });
		const key = faker.string.uuid();
		await keyv.set(key, faker.lorem.word());
		await keyv.clear();
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("flushes the entire server regardless of namespace", async () => {
		const store1 = new KeyvMemcache(uri);
		const store2 = new KeyvMemcache(uri);
		const keyv1 = new Keyv({ store: store1, namespace: "ns1" });
		const keyv2 = new Keyv({ store: store2, namespace: "ns2" });

		const key = faker.string.uuid();
		await keyv1.set(key, faker.lorem.word());
		await keyv2.set(key, faker.lorem.word());

		// Clearing from one instance flushes everything.
		await keyv1.clear();

		expect(await keyv1.get(key)).toBeUndefined();
		expect(await keyv2.get(key)).toBeUndefined();
	});
});

describe("namespace", () => {
	test("formatKey returns the key unchanged when no namespace is set", () => {
		const key = faker.string.uuid();
		expect(new KeyvMemcache(uri).formatKey(key)).toBe(key);
	});

	test("formatKey prefixes the key when a namespace is set", () => {
		const store = new KeyvMemcache(uri);
		store.namespace = "myapp";
		const key = faker.string.uuid();
		expect(store.formatKey(key)).toBe(`myapp:${key}`);
	});

	test("accepts a namespace through the constructor options", () => {
		const store = new KeyvMemcache(uri, { namespace: "opt-ns" });
		expect(store.namespace).toBe("opt-ns");
		expect(store.formatKey("foo")).toBe("opt-ns:foo");
	});

	test("prefixes keys natively when a namespace is set", async () => {
		const store = new KeyvMemcache(uri);
		store.namespace = "native-ns";
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		// The underlying client stores the value under the prefixed key.
		expect(await store.client.get(`native-ns:${key}`)).toBeDefined();
	});

	test("isolates keys across namespaces on the same store", async () => {
		const store = new KeyvMemcache(uri);
		const key = faker.string.uuid();

		store.namespace = "ns-a";
		await store.set(key, "a");
		store.namespace = "ns-b";
		await store.set(key, "b");

		expect(await store.get(key)).toBe("b");
		store.namespace = "ns-a";
		expect(await store.get(key)).toBe("a");
	});

	test("isolates keys across Keyv instances with separate stores", async () => {
		// Each namespace needs its own store instance: the namespace lives on the
		// adapter, so a single shared store cannot serve two namespaces at once.
		const keyv1 = new Keyv({ store: new KeyvMemcache(uri), namespace: "keyv1" });
		const keyv2 = new Keyv({ store: new KeyvMemcache(uri), namespace: "keyv2" });

		const key = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();

		await keyv1.set(key, val1);
		await keyv2.set(key, val2);

		expect(await keyv1.get(key)).toBe(val1);
		expect(await keyv2.get(key)).toBe(val2);
	});
});

describe("ttl and expiration", () => {
	test("keeps a value that has not yet expired", async () => {
		const keyv = new Keyv<string>({ store: keyvMemcache });
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, value, 10_000);
		await delay(2000);
		expect(await keyv.get(key)).toBe(value);
	});

	test("returns undefined once a value has expired", async () => {
		const keyv = new Keyv<string>({ store: keyvMemcache });
		const key = faker.string.uuid();
		await keyv.set(key, faker.lorem.word(), 1000);
		await delay(2000);
		expect(await keyv.get(key)).toBeUndefined();
	});

	test("get returns undefined for a sub-second expired key", async () => {
		const key = faker.string.uuid();
		// Direct adapter set takes an absolute expiry (Unix ms). A 1s window is the
		// smallest memcache exptime, so this evicts within ~1s.
		await keyvMemcache.set(key, faker.lorem.word(), Date.now() + 1000);
		await delay(1500);
		expect(await keyvMemcache.get(key)).toBeUndefined();
	});

	test("has returns false for a sub-second expired key", async () => {
		const key = faker.string.uuid();
		await keyvMemcache.set(key, faker.lorem.word(), Date.now() + 1000);
		await delay(1500);
		expect(await keyvMemcache.has(key)).toBe(false);
	});

	test("has returns false once a value has expired", async () => {
		const keyv = new Keyv({ store: keyvMemcache });
		const key = faker.string.uuid();
		await keyv.set(key, faker.lorem.word(), 1000);
		await delay(2000);
		expect(await keyv.has(key)).toBe(false);
	});
});

describe("error handling", () => {
	test("get emits an error and returns undefined on connection failure", async () => {
		const store = new KeyvMemcache("baduri:11211");
		let errorEmitted = false;
		store.on("error", () => {
			errorEmitted = true;
		});

		const result = await store.get(faker.string.uuid());
		expect(errorEmitted).toBe(true);
		expect(result).toBeUndefined();
	});

	test("set emits an error on connection failure", async () => {
		const store = new KeyvMemcache("baduri:11211");
		let errorEmitted = false;
		store.on("error", () => {
			errorEmitted = true;
		});

		await store.set(faker.string.uuid(), faker.lorem.word());
		expect(errorEmitted).toBe(true);
	});

	test("setMany emits an error on connection failure", { timeout: 30_000 }, async () => {
		const store = new KeyvMemcache("baduri:11211");
		let errorEmitted = false;
		store.on("error", () => {
			errorEmitted = true;
		});

		await store.setMany([{ key: faker.string.uuid(), value: faker.lorem.word() }]);
		expect(errorEmitted).toBe(true);
	});

	test("delete emits an error and returns false on connection failure", async () => {
		const store = new KeyvMemcache("baduri:11211");
		let errorEmitted = false;
		store.on("error", () => {
			errorEmitted = true;
		});

		const result = await store.delete(faker.string.uuid());
		expect(errorEmitted).toBe(true);
		expect(result).toBe(false);
	});

	test("clear emits an error on connection failure", async () => {
		const store = new KeyvMemcache("baduri:11211");
		let errorEmitted = false;
		store.on("error", () => {
			errorEmitted = true;
		});

		await store.clear();
		expect(errorEmitted).toBe(true);
	});

	test("has returns false on connection failure", { timeout: 30_000 }, async () => {
		const keyv = new Keyv({ store: new KeyvMemcache("baduri:11211") });
		keyv.on("error", () => {});
		expect(await keyv.has(faker.string.uuid())).toBe(false);
	});

	test("forwards asynchronous client errors to adapter listeners", () => {
		const store = new KeyvMemcache(uri);
		let captured: unknown;
		store.on("error", (error) => {
			captured = error;
		});

		// The memcache client forwards node errors as `(nodeId, error)`.
		const boom = new Error("boom");
		store.client.emit("error", "node-1", boom);

		expect(captured).toBe(boom);
	});

	test("wraps a client error event that carries no Error argument", () => {
		const store = new KeyvMemcache(uri);
		let captured: unknown;
		store.on("error", (error) => {
			captured = error;
		});

		// Degenerate shape: no Error instance present, so the payload is wrapped in an Error.
		store.client.emit("error", "connection reset");

		expect(captured).toBeInstanceOf(Error);
		expect((captured as Error).message).toBe("connection reset");
	});

	test("does not emit when a client error event carries no payload", () => {
		const store = new KeyvMemcache(uri);
		let emitted = false;
		store.on("error", () => {
			emitted = true;
		});

		// Nothing to surface, so nothing should be forwarded to listeners.
		store.client.emit("error");

		expect(emitted).toBe(false);
	});
});

describe("disconnect", () => {
	test("disconnects without throwing", async () => {
		const store = new KeyvMemcache(uri);
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		await expect(store.disconnect()).resolves.toBeUndefined();
	});
});

describe("createKeyv", () => {
	test("returns a Keyv instance from a string uri", () => {
		expect(createKeyv(uri)).toBeInstanceOf(Keyv);
	});

	test("returns a Keyv instance from an options object", () => {
		expect(createKeyv({ nodes: [uri], timeout: 3000 })).toBeInstanceOf(Keyv);
	});
});

const store = () => keyvMemcache;

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);
// Memcached does not support key enumeration, so the iterator suite is disabled.
// Memcached `exptime` has 1-second granularity, so use second-scale expiry deadlines.
storageTestSuite(test, store, { iterator: false, ttlGranularity: "seconds" });
