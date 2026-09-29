import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, expect, it, vi } from "vitest";
import {
	EtcdClient,
	type EtcdDeleteBuilder,
	type EtcdPutBuilder,
	prefixEnd,
} from "../src/client.js";
import KeyvEtcd, { createKeyv } from "../src/index.js";

const etcdUrl = "etcd://127.0.0.1:2379";

const store = () => new KeyvEtcd({ uri: etcdUrl, busyTimeout: 3000 });

keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);
storageTestSuite(it, store, { ttlGranularity: "seconds" });

/** Collects an adapter's iterator into a map from key to value. */
async function collect(store: KeyvEtcd): Promise<Map<string, string>> {
	const results = new Map<string, string>();
	for await (const [key, value] of store.iterator()) {
		results.set(key, value);
	}

	return results;
}

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
	});

	it("should not enable ttl when it is not a number using the default url", (t) => {
		// @ts-expect-error - ttl is not a number, just for test
		const store = new KeyvEtcd({ ttl: true });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBeUndefined();
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
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
	});

	it("should enable ttl using a url string and options", (t) => {
		const store = new KeyvEtcd("127.0.0.1:2379", { ttl: 1000 });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBe(1000);
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
	});

	it("should use the namespace option", (t) => {
		t.expect(new KeyvEtcd({ namespace: "ns" }).namespace).toBe("ns");
		t.expect(new KeyvEtcd("127.0.0.1:2379", { namespace: "ns" }).namespace).toBe("ns");
	});

	it("should not enable ttl when it is not a number using a url string and options", (t) => {
		// @ts-expect-error - ttl is not a number, just for test
		const store = new KeyvEtcd("127.0.0.1:2379", { ttl: true });
		t.expect(store.url).toBe("127.0.0.1:2379");
		t.expect(store.ttl).toBeUndefined();
		t.expect(store.busyTimeout).toBeUndefined();
		t.expect(store.namespace).toBeUndefined();
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

	it("should only reach its own entries without a namespace by default", (t) => {
		const store = new KeyvEtcd(etcdUrl);
		t.expect(store.noNamespaceAffectsAll).toBe(false);
		store.noNamespaceAffectsAll = true;
		t.expect(store.noNamespaceAffectsAll).toBe(true);
		t.expect(
			new KeyvEtcd({ url: etcdUrl, noNamespaceAffectsAll: true }).noNamespaceAffectsAll,
		).toBe(true);
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

	it("should keep a key that starts with the namespace apart from the key without it", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const namespace = faker.string.alphanumeric(10);
		store.namespace = namespace;
		const key = faker.string.uuid();
		const prefixedKey = `${namespace}:${key}`;
		await store.set(prefixedKey, "prefixed");
		await store.set(key, "plain");

		t.expect(await store.get(prefixedKey)).toBe("prefixed");
		t.expect(await store.get(key)).toBe("plain");
		t.expect(await store.delete(key)).toBe(true);
		t.expect(await store.has(prefixedKey)).toBe(true);
		await store.clear();
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

	it("should format a key with the namespace, even one that already starts with it", (t) => {
		const store = new KeyvEtcd();
		store.namespace = "ns";
		t.expect(store.formatKey("key")).toBe("ns:key");
		t.expect(store.formatKey("ns:key")).toBe("ns:ns:key");
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
		t.expect(store.removeKeyPrefix("ns:ns:key", "ns")).toBe("ns:key");
		t.expect(store.removeKeyPrefix("other:ns:key", "ns")).toBe("other:ns:key");
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

	it("should use Keyv's default serializer for the value envelope", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		const value = {
			bigint: BigInt("9223372036854775807"),
			buffer: Buffer.from("keyv-etcd"),
			markerLikeString: ":bigint:123",
		};

		t.expect(await store.set(key, value)).toBe(true);
		t.expect(await store.get(key)).toEqual(value);
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

	it("should count the default ttl from each write", async (t) => {
		const store = new KeyvEtcd(etcdUrl, { ttl: 5000 });
		const key = faker.string.uuid();
		const before = Date.now();
		await store.set(key, "value");
		const raw = await store.client.get(store.formatKey(key));
		const { e } = JSON.parse(raw as string) as { e: number };
		t.expect(e).toBeGreaterThanOrEqual(before + 5000);
		t.expect(e).toBeLessThanOrEqual(Date.now() + 5000);
	});

	it("should keep writing after the lease of an earlier default-ttl write expires", async (t) => {
		const store = new KeyvEtcd(etcdUrl, { ttl: 1000 });
		const first = faker.string.uuid();
		t.expect(await store.set(first, "first")).toBe(true);
		await sleep(2500);
		const second = faker.string.uuid();
		t.expect(await store.set(second, "second")).toBe(true);
		t.expect(await store.get(second)).toBe("second");
	});

	it("should apply a default ttl assigned after construction", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		store.ttl = 5000;
		const key = faker.string.uuid();
		t.expect(await store.set(key, "value")).toBe(true);
		t.expect(await store.get(key)).toBe("value");
		const raw = await store.client.get(store.formatKey(key));
		t.expect((JSON.parse(raw as string) as { e: number }).e).toBeGreaterThan(Date.now());
	});

	it("should store a key without expiry when the default ttl is not positive", async (t) => {
		const store = new KeyvEtcd(etcdUrl, { ttl: 0 });
		const key = faker.string.uuid();
		t.expect(await store.set(key, "value")).toBe(true);
		const raw = await store.client.get(store.formatKey(key));
		t.expect((JSON.parse(raw as string) as { e: number | null }).e).toBeNull();
		t.expect(await store.get(key)).toBe("value");
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

	it("should return JSON null written directly to etcd as-is", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const key = faker.string.uuid();
		await store.client.put(store.formatKey(key)).value("null");
		t.expect(await store.get(key)).toBe("null");
		t.expect(await store.has(key)).toBe(true);
	});

	it("should grant a lease only once, even for concurrent puts", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const leaseGrant = vi.spyOn(store.client, "leaseGrant");
		const lease = store.client.lease(5);
		await Promise.all([
			lease.put(store.formatKey(faker.string.uuid())).value("a"),
			lease.put(store.formatKey(faker.string.uuid())).value("b"),
		]);
		t.expect(leaseGrant).toHaveBeenCalledTimes(1);
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

	it("should emit an error and report false when setMany fails", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		await store.disconnect();
		const errors: unknown[] = [];
		store.on("error", (error: unknown) => {
			errors.push(error);
		});
		const results = await store.setMany([
			{ key: "key", value: "value" },
			{ key: "key2", value: "value2" },
		]);
		t.expect(results).toEqual([false, false]);
		t.expect(errors.length).toBeGreaterThan(0);
	});

	it("should report which setMany writes failed", async (t) => {
		const store = new KeyvEtcd(etcdUrl);
		const keyv = new Keyv({ store });
		keyv.on("error", () => {});
		const storedKey = faker.string.uuid();
		const failedKey = faker.string.uuid();
		const put = store.client.put.bind(store.client);
		vi.spyOn(store.client, "put").mockImplementation((key: string) => {
			if (key !== failedKey) {
				return put(key);
			}

			return {
				value: async () => {
					throw new Error("put failed");
				},
			} as unknown as EtcdPutBuilder;
		});

		const results = await keyv.setMany([
			{ key: storedKey, value: "stored" },
			{ key: failedKey, value: "failed" },
		]);

		t.expect(results).toEqual([true, false]);
		t.expect(await keyv.get(storedKey)).toBe("stored");
		t.expect(await keyv.get(failedKey)).toBeUndefined();
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

describe("clear and iterator without a namespace", () => {
	/**
	 * Writes this adapter's entries without a namespace, one of them with a colon in its key,
	 * another namespace's entry, and other applications' keys, including an empty value and a key
	 * that isn't valid UTF-8.
	 */
	async function seed() {
		const id = faker.string.alphanumeric(12);
		const store = new KeyvEtcd(etcdUrl);
		const namespaced = new KeyvEtcd({ url: etcdUrl, namespace: `ns-${id}` });
		const own = { plain: `own-${id}`, colon: `user:${id}` };
		await store.set(own.plain, "plain-value");
		await store.set(own.colon, "colon-value");
		await namespaced.set("42", "namespaced-value");
		const foreign = {
			json: `/registry/services/${id}`,
			text: `feature-flags/${id}`,
			empty: `empty-${id}`,
			binary: Buffer.concat([Buffer.from(`binary-${id}-`), Buffer.from([0xff, 0xfe])]),
		};
		await store.client.putRaw({ key: foreign.json, value: JSON.stringify({ kind: "Service" }) });
		await store.client.putRaw({ key: foreign.text, value: "on" });
		await store.client.putRaw({ key: foreign.empty, value: "" });
		await store.client.putRaw({ key: foreign.binary, value: "binary-value" });
		return { store, namespaced, own, foreign, namespacedKey: `ns-${id}:42` };
	}

	it("should record the namespace each value is written under", async (t) => {
		const id = faker.string.alphanumeric(12);
		const store = new KeyvEtcd(etcdUrl);
		const namespaced = new KeyvEtcd({ url: etcdUrl, namespace: `ns-${id}` });
		await store.set(`plain-${id}`, "a");
		await namespaced.set("key", "b");
		t.expect(JSON.parse((await store.client.get(`plain-${id}`)) as string)).toEqual({
			v: "a",
			e: null,
			n: null,
		});
		t.expect(JSON.parse((await store.client.get(`ns-${id}:key`)) as string)).toEqual({
			v: "b",
			e: null,
			n: `ns-${id}`,
		});
	});

	it("should clear only entries written without a namespace", async (t) => {
		const { store, namespaced, own, foreign } = await seed();
		await store.clear();

		t.expect(await store.get(own.plain)).toBeUndefined();
		t.expect(await store.get(own.colon)).toBeUndefined();
		t.expect(await namespaced.get("42")).toBe("namespaced-value");
		t.expect(await store.client.get(foreign.json)).toBe(JSON.stringify({ kind: "Service" }));
		t.expect(await store.client.get(foreign.text)).toBe("on");
		t.expect((await store.client.range({ key: foreign.empty })).kvs).toHaveLength(1);
		t.expect((await store.client.range({ key: foreign.binary })).kvs).toHaveLength(1);
	});

	it("should iterate only over entries written without a namespace", async (t) => {
		const { store, own, foreign, namespacedKey } = await seed();
		const results = await collect(store);

		t.expect(results.get(own.plain)).toBe("plain-value");
		t.expect(results.get(own.colon)).toBe("colon-value");
		t.expect(results.has(namespacedKey)).toBe(false);
		t.expect(results.has(foreign.json)).toBe(false);
		t.expect(results.has(foreign.text)).toBe(false);
		t.expect(results.has(foreign.empty)).toBe(false);
	});

	it("should clear and iterate entries written before the namespace was recorded", async (t) => {
		const id = faker.string.alphanumeric(12);
		const store = new KeyvEtcd(etcdUrl);
		// Envelopes written before `n` was added count when their key has no namespace
		// separator, and so do the `{ value, expires }` entries Keyv v5 wrote.
		const entries = {
			envelope: [`legacy-${id}`, JSON.stringify({ v: "legacy-value", e: null })],
			envelopeWithColon: [`legacy:${id}`, JSON.stringify({ v: "prefixed-value", e: null })],
			v5: [`v5-${id}`, JSON.stringify({ value: "v5-value", expires: null })],
			v5WithExpiry: [`v5-ttl-${id}`, JSON.stringify({ value: "v5", expires: Date.now() + 60_000 })],
			v5WithColon: [`v5:${id}`, JSON.stringify({ value: "v5-prefixed", expires: null })],
			extraField: [`extra-${id}`, JSON.stringify({ v: "extra", e: null, other: 1 })],
		};
		for (const [key, value] of Object.values(entries)) {
			await store.client.putRaw({ key, value });
		}

		const results = await collect(store);
		t.expect(results.get(entries.envelope[0])).toBe("legacy-value");
		t.expect(results.get(entries.v5[0])).toBe(entries.v5[1]);
		t.expect(results.get(entries.v5WithExpiry[0])).toBe(entries.v5WithExpiry[1]);
		t.expect(results.has(entries.envelopeWithColon[0])).toBe(false);
		t.expect(results.has(entries.v5WithColon[0])).toBe(false);
		t.expect(results.has(entries.extraField[0])).toBe(false);

		await store.clear();
		t.expect(await store.client.get(entries.envelope[0])).toBeNull();
		t.expect(await store.client.get(entries.v5[0])).toBeNull();
		t.expect(await store.client.get(entries.v5WithExpiry[0])).toBeNull();
		t.expect(await store.client.get(entries.envelopeWithColon[0])).not.toBeNull();
		t.expect(await store.client.get(entries.v5WithColon[0])).not.toBeNull();
		t.expect(await store.client.get(entries.extraField[0])).not.toBeNull();
	});

	it("should skip and delete expired entries while iterating", async (t) => {
		const id = faker.string.alphanumeric(12);
		const store = new KeyvEtcd(etcdUrl);
		const expiredKey = `expired-${id}`;
		const expiredV5Key = `expired-v5-${id}`;
		await store.client.putRaw({
			key: expiredKey,
			value: JSON.stringify({ v: "stale", e: Date.now() - 1000, n: null }),
		});
		await store.client.putRaw({
			key: expiredV5Key,
			value: JSON.stringify({ value: "stale", expires: Date.now() - 1000 }),
		});

		const results = await collect(store);
		t.expect(results.has(expiredKey)).toBe(false);
		t.expect(results.has(expiredV5Key)).toBe(false);
		t.expect(await store.client.get(expiredKey)).toBeNull();
		t.expect(await store.client.get(expiredV5Key)).toBeNull();
	});

	it("should emit an error and keep iterating when deleting an expired entry fails", async (t) => {
		const id = faker.string.alphanumeric(12);
		const store = new KeyvEtcd(etcdUrl);
		const errors: Error[] = [];
		store.on("error", (error: Error) => {
			errors.push(error);
		});
		await store.client.putRaw({
			key: `expired-${id}`,
			value: JSON.stringify({ v: "stale", e: Date.now() - 1000, n: null }),
		});
		await store.set(`live-${id}`, "live");
		vi.spyOn(store.client, "delete").mockReturnValue({
			key: async () => {
				throw new Error("delete failed");
			},
		} as unknown as EtcdDeleteBuilder);

		const results = await collect(store);
		t.expect(results.get(`live-${id}`)).toBe("live");
		t.expect(errors.some((error) => error.message === "delete failed")).toBe(true);
	});

	it("should page through more entries than one request returns", async (t) => {
		const id = faker.string.alphanumeric(12);
		const store = new KeyvEtcd(etcdUrl);
		const keys = Array.from({ length: 150 }, (_, index) => `page-${id}-${index}`);
		await store.setMany(keys.map((key) => ({ key, value: "value" })));

		const results = await collect(store);
		t.expect(keys.every((key) => results.get(key) === "value")).toBe(true);

		await store.clear();
		t.expect(await store.getMany(keys)).toEqual(keys.map(() => undefined));
	});

	it("should clear and iterate every key when noNamespaceAffectsAll is set", async (t) => {
		const { store, namespaced, foreign, namespacedKey } = await seed();
		const everything = new KeyvEtcd({ url: etcdUrl, noNamespaceAffectsAll: true });

		const results = await collect(everything);
		t.expect(results.get(foreign.text)).toBe("on");
		t.expect(results.has(namespacedKey)).toBe(true);

		await everything.clear();
		t.expect(await store.client.get(foreign.text)).toBeNull();
		t.expect(await namespaced.get("42")).toBeUndefined();
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

	it("should keep the namespace passed in the options", (t) => {
		const keyv = createKeyv(etcdUrl, { namespace: "ns" });
		t.expect(keyv.namespace).toBe("ns");
		t.expect((keyv.store as KeyvEtcd).namespace).toBe("ns");
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

	it("should end a scan when etcd returns no pairs", async (t) => {
		const client = new EtcdClient({ url: "http://127.0.0.1:2379" });
		vi.stubGlobal(
			"fetch",
			async () =>
				new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
		);
		try {
			const pages = [];
			for await (const page of client.scanAll(10)) {
				pages.push(page);
			}

			t.expect(pages).toEqual([[]]);
		} finally {
			vi.unstubAllGlobals();
		}
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
