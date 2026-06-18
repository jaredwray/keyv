import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, expect, it, vi } from "vitest";
import { EtcdClient, prefixEnd } from "../src/client.js";
import KeyvEtcd, { createKeyv } from "../src/index.js";

const etcdUrl = "etcd://127.0.0.1:2379";

const store = () => new KeyvEtcd({ uri: etcdUrl, busyTimeout: 3000 });

keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);
storageTestSuite(it, store, { ttlGranularity: "seconds" });

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

describe("construction and properties", () => {
	it("should use the default options", (t) => {
		const store = new KeyvEtcd();
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBeUndefined();
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
	});

	it("should enable ttl using the default url", (t) => {
		const store = new KeyvEtcd({ ttl: 1000 });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBe(1000);
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
		t.expect(store.lease).toBeDefined();
	});

	it("should not enable ttl when it is not a number using the default url", (t) => {
		// @ts-expect-error - ttl is not a number, just for test
		const store = new KeyvEtcd({ ttl: true });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBeUndefined();
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
		t.expect(store.lease).toBeUndefined();
	});

	it("should enable ttl using a url option", (t) => {
		const store = new KeyvEtcd({
			url: "127.0.0.1:2379",
			ttl: 1000,
		});
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBe(1000);
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
		t.expect(store.lease).toBeDefined();
	});

	it("should enable ttl using a url string and options", (t) => {
		const store = new KeyvEtcd("127.0.0.1:2379", { ttl: 1000 });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBe(1000);
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
		t.expect(store.lease).toBeDefined();
	});

	it("should not enable ttl when it is not a number using a url string and options", (t) => {
		// @ts-expect-error - ttl is not a number, just for test
		const store = new KeyvEtcd("127.0.0.1:2379", { ttl: true });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBeUndefined();
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
		t.expect(store.lease).toBeUndefined();
	});

	it("should get and set the url", (t) => {
		const store = new KeyvEtcd();
		t.expect(store.url).toBe("127.0.0.1:2379");
		store.url = "10.0.0.1:2379";
		t.expect(store.url).toBe("10.0.0.1:2379");
	});

	it("should get and set the ttl", (t) => {
		const store = new KeyvEtcd();
		t.expect(store.ttl).toBeUndefined();
		store.ttl = 5000;
		t.expect(store.ttl).toBe(5000);
		store.ttl = undefined;
		t.expect(store.ttl).toBeUndefined();
	});

	it("should get and set the busyTimeout", (t) => {
		const store = new KeyvEtcd({ busyTimeout: 3000 });
		t.expect(store.busyTimeout).toBe(3000);
		t.expect(store.client.timeout).toBe(3000);
		store.busyTimeout = 5000;
		t.expect(store.busyTimeout).toBe(5000);
		t.expect(store.client.timeout).toBe(5000);
		store.busyTimeout = undefined;
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.client.timeout).toBeUndefined();
	});

	it("should get and set the client", (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const originalClient = store.client;
		t.expect(originalClient).toBeDefined();
		const newStore = new KeyvEtcd(etcdUrl);
		store.client = newStore.client;
		t.expect(store.client).toBe(newStore.client);
		t.expect(store.client).not.toBe(originalClient);
	});

	it("should get and set the lease", (t) => {
		const store = new KeyvEtcd(etcdUrl, { ttl: 1000 });
		t.expect(store.lease).toBeDefined();
		store.lease = undefined;
		t.expect(store.lease).toBeUndefined();
	});
});

describe("namespace and key prefixing", () => {
	it("should set and get a value with a namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.namespace = faker.string.alphanumeric(10);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		t.expect(await store.get(key)).toBe(value);
	});

	it("should delete a value with a namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.namespace = faker.string.alphanumeric(10);
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		t.expect(await store.delete(key)).toBe(true);
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("should check a value with has when a namespace is set", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.namespace = faker.string.alphanumeric(10);
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		t.expect(await store.has(key)).toBe(true);
		await store.delete(key);
		t.expect(await store.has(key)).toBe(false);
	});

	it("should format a key with the namespace and avoid double prefixing", (t) => {
		const store = new KeyvEtcd();
		store.namespace = "ns";
		t.expect(store.formatKey("key")).toBe("ns:key");
		t.expect(store.formatKey("ns:key")).toBe("ns:key");
		store.namespace = undefined;
		t.expect(store.formatKey("key")).toBe("key");
	});

	it("should create a key prefix when a namespace is provided", (t) => {
		const store = new KeyvEtcd();
		t.expect(store.createKeyPrefix("key", "ns")).toBe("ns:key");
		t.expect(store.createKeyPrefix("key")).toBe("key");
		t.expect(store.createKeyPrefix("key", undefined)).toBe("key");
	});

	it("should remove a key prefix when a namespace is provided", (t) => {
		const store = new KeyvEtcd();
		t.expect(store.removeKeyPrefix("ns:key", "ns")).toBe("key");
		t.expect(store.removeKeyPrefix("key")).toBe("key");
		t.expect(store.removeKeyPrefix("key", undefined)).toBe("key");
	});

	it("should get and set the keyPrefixSeparator", (t) => {
		const store = new KeyvEtcd();
		t.expect(store.keyPrefixSeparator).toBe(":");
		store.keyPrefixSeparator = "::";
		t.expect(store.keyPrefixSeparator).toBe("::");
		t.expect(store.createKeyPrefix("key", "ns")).toBe("ns::key");
	});
});

describe("get, set, and delete", () => {
	it("should return false when deleting a non-string key", async (t) => {
		const store = new KeyvEtcd({ uri: etcdUrl });
		// @ts-expect-error - key needs be a string, just for test
		t.expect(await store.delete(123)).toBeFalsy();
	});

	it("should store and retrieve a raw value", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		// The adapter stores the raw encoded value with no envelope wrapping.
		await store.client.put(store.formatKey(key)).value("raw-value");
		const result = await store.get(key);
		t.expect(result).toBe("raw-value");
	});
});

describe("ttl and expiration", () => {
	it("should respect the default ttl option", async (t) => {
		const keyv = new KeyvEtcd(etcdUrl, { ttl: 1000 });
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
		await sleep(3000);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	it("should respect a per-call absolute expires", async (t) => {
		const keyv = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		// Adapter set takes an absolute expiry (Unix ms). etcd leases are second-granular.
		await keyv.set(key, "value", Date.now() + 1000);
		t.expect(await keyv.get(key)).toBe("value");
		await sleep(3000);
		t.expect(await keyv.get(key)).toBeUndefined();
	});

	it("should return false from has for an expired key", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		// etcd leases are clamped to a minimum of one second, so wait past that.
		await store.set(key, "value", Date.now() + 1000);
		await sleep(3000);
		t.expect(await store.has(key)).toBe(false);
	});

	it("should return undefined from get for an expired key", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		// etcd leases are clamped to a minimum of one second, so wait past that.
		await store.set(key, "value", Date.now() + 1000);
		await sleep(3000);
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("should expire a present-but-stale envelope on has via the client-side check", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		// Write an envelope whose `e` is already in the past with NO lease, so the key
		// persists server-side. has() must apply the precise client-side check, report it
		// expired, and reap the key (etcd leases are coarse and lazily revoked).
		await store.client
			.put(store.formatKey(key))
			.value(JSON.stringify({ v: "stale", e: Date.now() - 1000 }));
		t.expect(await store.has(key)).toBe(false);
		t.expect(await store.client.get(store.formatKey(key))).toBeNull();
	});

	it("should return non-envelope values written directly to etcd as-is", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		// A valid-JSON value that is not our { v, e } envelope (e.g. written by another
		// client) must be returned verbatim and never treated as expired.
		await store.client.put(store.formatKey(key)).value(JSON.stringify({ foo: "bar" }));
		t.expect(await store.get(key)).toBe(JSON.stringify({ foo: "bar" }));
		t.expect(await store.has(key)).toBe(true);
	});

	it("should cache the granted lease id across concurrent puts", async (t) => {
		const store = new KeyvEtcd(etcdUrl, { ttl: 5000 });
		const sharedLease = store.lease;
		t.expect(sharedLease).toBeDefined();
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		// Two sequential puts on the same default lease — the second must reuse the
		// already-granted lease ID rather than minting a fresh grant.
		await store.set(key1, "a");
		await store.set(key2, "b");
		const id1 = await sharedLease?.grant();
		const id2 = await sharedLease?.grant();
		t.expect(id1).toBeDefined();
		t.expect(id1).toBe(id2);
	});
});

describe("batch operations", () => {
	it("should get many values with a namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.namespace = faker.string.alphanumeric(10);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.word();
		await store.set(key1, value1);
		await store.set(key2, value2);
		const results = await store.getMany([key1, key2]);
		t.expect(results).toEqual([value1, value2]);
	});

	it("should check multiple keys with hasMany", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		await store.set(key1, faker.lorem.word());
		await store.set(key2, faker.lorem.word());
		const results = await store.hasMany([key1, key2, key3]);
		t.expect(results).toEqual([true, true, false]);
	});

	it("should emit an error when setMany fails", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.disconnect();
		const errors: unknown[] = [];
		store.on("error", (error: unknown) => {
			errors.push(error);
		});
		await store.setMany([{ key: "key", value: "value" }]);
		t.expect(errors.length).toBeGreaterThan(0);
	});
});

describe("clear", () => {
	it("should clear the store with the default namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		t.expect(await store.get(key)).toBe(value);
		await store.clear();
		t.expect(await store.get(key)).toBeUndefined();
	});

	it("should clear the store with a namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.namespace = faker.string.alphanumeric(10);
		const key = faker.string.uuid();
		await store.set(key, faker.lorem.word());
		await store.clear();
		t.expect(await store.get(key)).toBeUndefined();
	});
});

describe("iterator", () => {
	it("should iterate over keys with a namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.namespace = faker.string.alphanumeric(10);
		const key1 = faker.string.uuid();
		const value1 = faker.lorem.word();
		const key2 = faker.string.uuid();
		const value2 = faker.lorem.word();
		await store.set(key1, value1);
		await store.set(key2, value2);
		const results = new Map<string, string>();
		for await (const [key, value] of store.iterator()) {
			results.set(key as string, value as string);
		}

		t.expect(results.size).toBe(2);
		t.expect(results.get(key1)).toBe(value1);
		t.expect(results.get(key2)).toBe(value2);
	});

	it("should iterate over keys without a namespace", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.clear();
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await store.set(key, value);
		const iterator = store.iterator();
		const entry = await iterator.next();
		// @ts-expect-error - test iterator
		t.expect(entry.value[0]).toBe(key);
		// @ts-expect-error - test iterator
		t.expect(entry.value[1]).toBe(value);
	});
});

describe("createKeyv", () => {
	it("should return a Keyv instance with a KeyvEtcd store", (t) => {
		const keyv = createKeyv(etcdUrl);
		t.expect(keyv).toBeInstanceOf(Keyv);
		t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
	});

	it("should pass options when a url string is provided", (t) => {
		const keyv = createKeyv(etcdUrl, { ttl: 5000 });
		t.expect(keyv).toBeInstanceOf(Keyv);
		t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
		t.expect((keyv.store as KeyvEtcd).ttl).toBe(5000);
	});

	it("should accept an options object", (t) => {
		const keyv = createKeyv({ url: "127.0.0.1:2379", ttl: 3000 });
		t.expect(keyv).toBeInstanceOf(Keyv);
		t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
		t.expect((keyv.store as KeyvEtcd).ttl).toBe(3000);
	});

	it("should set and get a value", async (t) => {
		const keyv = createKeyv(etcdUrl);
		const key = faker.string.uuid();
		const value = faker.lorem.word();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
		await keyv.delete(key);
	});
});

describe("disconnect and error handling", () => {
	it("should close the connection successfully", async (t) => {
		const keyv = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		t.expect(await keyv.get(key)).toBeUndefined();
		await keyv.disconnect();
		try {
			await keyv.get(key);
			t.expect.fail();
		} catch {
			t.expect(true).toBeTruthy();
		}
	});

	it("should emit an error from get on a disconnected client", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.disconnect();
		const errors: unknown[] = [];
		store.on("error", (error: unknown) => {
			errors.push(error);
		});
		await store.get("key");
		t.expect(errors.length).toBeGreaterThan(0);
	});

	it("should emit an error from delete on a disconnected client", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.disconnect();
		const errors: unknown[] = [];
		store.on("error", (error: unknown) => {
			errors.push(error);
		});
		const result = await store.delete("key");
		t.expect(result).toBe(false);
		t.expect(errors.length).toBeGreaterThan(0);
	});

	it("should emit an error from clear on a disconnected client", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.disconnect();
		const errors: unknown[] = [];
		store.on("error", (error: unknown) => {
			errors.push(error);
		});
		await store.clear();
		t.expect(errors.length).toBeGreaterThan(0);
	});

	it("should return false from has on a disconnected client", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.disconnect();
		t.expect(await store.has("key")).toBe(false);
	});
});

describe("EtcdClient", () => {
	it("should abort hung requests when a timeout is set", async (t) => {
		// 192.0.2.1 is RFC 5737 TEST-NET-1 — guaranteed not to route, so the
		// fetch hangs until our AbortSignal.timeout fires.
		const client = new EtcdClient({ url: "http://192.0.2.1:2379", timeout: 200 });
		const start = Date.now();
		let error: Error | undefined;
		try {
			await client.status();
		} catch (e) {
			error = e as Error;
		}
		const elapsed = Date.now() - start;
		t.expect(error).toBeDefined();
		// Should be way under fetch's default ~30s connect timeout.
		t.expect(elapsed).toBeLessThan(2000);
	});

	it("should strip trailing slashes from the base url", async (t) => {
		const client = new EtcdClient({ url: "http://127.0.0.1:2379///" });
		const status = await client.status();
		t.expect(status).toBeDefined();
	});

	it("should surface error responses from etcd", async (t) => {
		const client = new EtcdClient({ url: "http://127.0.0.1:2379" });
		let error: Error | undefined;
		try {
			// Putting with a non-existent lease ID forces etcd to return an error.
			await client.putRaw({ key: "k", value: "v", lease: "999999999999999" });
		} catch (e) {
			error = e as Error;
		}
		t.expect(error).toBeDefined();
		t.expect(error?.message).toMatch(/lease/i);
	});

	it("should surface the legacy `error` field from etcd <3.6", async () => {
		await expectSurfacedError({
			error: "etcdserver: requested lease not found",
			code: 5,
			message: "etcdserver: requested lease not found",
		});
	});

	it("should surface the grpc-gateway v2 `message` field from etcd >=3.6", async () => {
		await expectSurfacedError({
			code: 5,
			message: "etcdserver: requested lease not found",
		});
	});

	it("should preserve raw bytes for non-ASCII prefixes in prefixEnd", (t) => {
		// "ÿ" encodes as bytes [0xC3, 0xBF]; incrementing the trailing byte yields
		// [0xC3, 0xC0], which is not valid UTF-8. prefixEnd must keep these bytes
		// intact so etcd's byte-based range_end is correct.
		const result = prefixEnd("ÿ");
		t.expect(Buffer.isBuffer(result)).toBe(true);
		t.expect(result.equals(Buffer.from([0xc3, 0xc0]))).toBe(true);

		// ASCII case still increments last byte
		t.expect(prefixEnd("ns:").equals(Buffer.from("ns;"))).toBe(true);

		// Empty prefix collapses to 0x00 ("scan everything")
		t.expect(prefixEnd("").equals(Buffer.from([0x00]))).toBe(true);
	});
});

// etcd <3.6 and etcd >=3.6 report errors with different JSON shapes (the
// grpc-gateway v2 upgrade in 3.6 dropped the top-level `error` field in favour
// of google.rpc.Status `message`). Stub fetch so both shapes are exercised
// deterministically, regardless of which etcd version backs the live suite.
async function expectSurfacedError(responseBody: unknown): Promise<void> {
	const client = new EtcdClient({ url: "http://127.0.0.1:2379" });
	vi.stubGlobal(
		"fetch",
		async () =>
			new Response(JSON.stringify(responseBody), {
				status: 404,
				headers: { "content-type": "application/json" },
			}),
	);
	try {
		let error: Error | undefined;
		try {
			await client.putRaw({ key: "k", value: "v", lease: "1" });
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeDefined();
		expect(error?.message).toMatch(/lease/i);
	} finally {
		vi.unstubAllGlobals();
	}
}
