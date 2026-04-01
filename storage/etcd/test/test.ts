import { faker } from "@faker-js/faker";
import { keyvIteratorTests, keyvTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { it } from "vitest";
import KeyvEtcd, { createKeyv } from "../src/index.js";

const etcdUrl = "etcd://127.0.0.1:2379";

const store = () => new KeyvEtcd({ uri: etcdUrl, busyTimeout: 3000 });

keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);

it("default options", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.url).toBe("127.0.0.1:2379");
	t.expect(store.ttl).toBeUndefined();
	t.expect(store.busyTimeout).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
});

it("enable ttl using default url", (t) => {
	const store = new KeyvEtcd({ ttl: 1000 });
	t.expect(store.url).toBe("127.0.0.1:2379");
	t.expect(store.ttl).toBe(1000);
	t.expect(store.busyTimeout).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	t.expect(store.lease).toBeDefined();
});

it("disable ttl using default url", (t) => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd({ ttl: true });
	t.expect(store.url).toBe("127.0.0.1:2379");
	t.expect(store.ttl).toBeUndefined();
	t.expect(store.busyTimeout).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	t.expect(store.lease).toBeUndefined();
});

it("enable ttl using url", (t) => {
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

it("enable ttl using url and options", (t) => {
	const store = new KeyvEtcd("127.0.0.1:2379", { ttl: 1000 });
	t.expect(store.url).toBe("127.0.0.1:2379");
	t.expect(store.ttl).toBe(1000);
	t.expect(store.busyTimeout).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	t.expect(store.lease).toBeDefined();
});

it("disable ttl using url and options", (t) => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd("127.0.0.1:2379", { ttl: true });
	t.expect(store.url).toBe("127.0.0.1:2379");
	t.expect(store.ttl).toBeUndefined();
	t.expect(store.busyTimeout).toBeUndefined();
	t.expect(store.namespace).toBeUndefined();
	t.expect(store.lease).toBeUndefined();
});

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

it("KeyvEtcd respects default tll option", async (t) => {
	const keyv = new KeyvEtcd(etcdUrl, { ttl: 1000 });
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
	await sleep(3000);
	t.expect(await keyv.get(key)).toBe(null);
});

it("set respects per-call ttl", async (t) => {
	const keyv = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	await keyv.set(key, "value", 1000);
	t.expect(await keyv.get(key)).toBe("value");
	await sleep(3000);
	t.expect(await keyv.get(key)).toBe(null);
});

it(".delete() with key as number", async (t) => {
	const store = new KeyvEtcd({ uri: etcdUrl });
	// @ts-expect-error - key needs be a string, just for test
	t.expect(await store.delete(123)).toBeFalsy();
});

it(".clear() with default namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);
	const result = (await store.get(key)) as string;
	t.expect(result).toBe(value);
	await store.clear();
	const result2 = (await store.get(key)) as string;
	t.expect(result2).toBe(null);
});

it(".clear() with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	await store.clear();
	t.expect(await store.get(key)).toBe(null);
});

it("close connection successfully", async (t) => {
	const keyv = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	t.expect(await keyv.get(key)).toBe(null);
	await keyv.disconnect();
	try {
		await keyv.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

it("iterator with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key1 = faker.string.uuid();
	const value1 = faker.lorem.word();
	const key2 = faker.string.uuid();
	const value2 = faker.lorem.word();
	await store.set(key1, value1);
	await store.set(key2, value2);
	const iterator = store.iterator(namespace);
	const results = new Map<string, string>();
	let entry = await iterator.next();
	while (!entry.done && entry.value) {
		results.set(entry.value[0] as string, entry.value[1] as string);
		entry = await iterator.next();
	}

	t.expect(results.size).toBe(2);
	t.expect(results.get(key1)).toBe(value1);
	t.expect(results.get(key2)).toBe(value2);
});

it("iterator without namespace", async (t) => {
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

it("get/set with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);
	t.expect(await store.get(key)).toBe(value);
});

it("delete with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	t.expect(await store.delete(key)).toBe(true);
	t.expect(await store.get(key)).toBe(null);
});

it("has with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	t.expect(await store.has(key)).toBe(true);
	await store.delete(key);
	t.expect(await store.has(key)).toBe(false);
});

it("getMany with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key1 = faker.string.uuid();
	const value1 = faker.lorem.word();
	const key2 = faker.string.uuid();
	const value2 = faker.lorem.word();
	await store.set(key1, value1);
	await store.set(key2, value2);
	const results = await store.getMany([key1, key2]);
	t.expect(results).toEqual([value1, value2]);
});

it("formatKey prefixes key and avoids double prefix", (t) => {
	const store = new KeyvEtcd();
	store.namespace = "ns";
	t.expect(store.formatKey("key")).toBe("ns:key");
	t.expect(store.formatKey("ns:key")).toBe("ns:key");
	store.namespace = undefined;
	t.expect(store.formatKey("key")).toBe("key");
});

it("createKeyPrefix returns prefixed key when namespace is set", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.createKeyPrefix("key", "ns")).toBe("ns:key");
	t.expect(store.createKeyPrefix("key")).toBe("key");
	t.expect(store.createKeyPrefix("key", undefined)).toBe("key");
});

it("removeKeyPrefix strips prefix when namespace is set", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.removeKeyPrefix("ns:key", "ns")).toBe("key");
	t.expect(store.removeKeyPrefix("key")).toBe("key");
	t.expect(store.removeKeyPrefix("key", undefined)).toBe("key");
});

it("namespace getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.namespace).toBeUndefined();
	store.namespace = "test-ns";
	t.expect(store.namespace).toBe("test-ns");
	store.namespace = undefined;
	t.expect(store.namespace).toBeUndefined();
});

it("keyPrefixSeparator getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.keyPrefixSeparator).toBe(":");
	store.keyPrefixSeparator = "::";
	t.expect(store.keyPrefixSeparator).toBe("::");
	t.expect(store.createKeyPrefix("key", "ns")).toBe("ns::key");
});

it("setMany sets multiple keys", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key1 = faker.string.uuid();
	const value1 = faker.lorem.word();
	const key2 = faker.string.uuid();
	const value2 = faker.lorem.word();
	await store.setMany([
		{ key: key1, value: value1 },
		{ key: key2, value: value2 },
	]);
	t.expect(await store.get(key1)).toBe(value1);
	t.expect(await store.get(key2)).toBe(value2);
});

it("setMany emits error on failure", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	const errors: unknown[] = [];
	store.on("error", (error: unknown) => {
		errors.push(error);
	});
	await store.setMany([{ key: "key", value: "value" }]);
	t.expect(errors.length).toBeGreaterThan(0);
});

it("hasMany checks multiple keys", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	await store.set(key1, faker.lorem.word());
	await store.set(key2, faker.lorem.word());
	const results = await store.hasMany([key1, key2, key3]);
	t.expect(results).toEqual([true, true, false]);
});

it("url getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.url).toBe("127.0.0.1:2379");
	store.url = "10.0.0.1:2379";
	t.expect(store.url).toBe("10.0.0.1:2379");
});

it("ttl getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.ttl).toBeUndefined();
	store.ttl = 5000;
	t.expect(store.ttl).toBe(5000);
	store.ttl = undefined;
	t.expect(store.ttl).toBeUndefined();
});

it("busyTimeout getter and setter", (t) => {
	const store = new KeyvEtcd({ busyTimeout: 3000 });
	t.expect(store.busyTimeout).toBe(3000);
	store.busyTimeout = 5000;
	t.expect(store.busyTimeout).toBe(5000);
	store.busyTimeout = undefined;
	t.expect(store.busyTimeout).toBeUndefined();
});

it("createKeyv returns a Keyv instance with KeyvEtcd store", (t) => {
	const keyv = createKeyv(etcdUrl);
	t.expect(keyv).toBeInstanceOf(Keyv);
	t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
});

it("createKeyv with options", (t) => {
	const keyv = createKeyv(etcdUrl, { ttl: 5000 });
	t.expect(keyv).toBeInstanceOf(Keyv);
	t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
	t.expect((keyv.store as KeyvEtcd).ttl).toBe(5000);
});

it("createKeyv with options object", (t) => {
	const keyv = createKeyv({ url: "127.0.0.1:2379", ttl: 3000 });
	t.expect(keyv).toBeInstanceOf(Keyv);
	t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
	t.expect((keyv.store as KeyvEtcd).ttl).toBe(3000);
});

it("createKeyv set and get", async (t) => {
	const keyv = createKeyv(etcdUrl);
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
	await keyv.delete(key);
});

it("get emits error on disconnected client", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	const errors: unknown[] = [];
	store.on("error", (error: unknown) => {
		errors.push(error);
	});
	await store.get("key");
	t.expect(errors.length).toBeGreaterThan(0);
});

it("delete emits error on disconnected client", async (t) => {
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

it("clear emits error on disconnected client", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	const errors: unknown[] = [];
	store.on("error", (error: unknown) => {
		errors.push(error);
	});
	await store.clear();
	t.expect(errors.length).toBeGreaterThan(0);
});

it("has returns false on disconnected client", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	t.expect(await store.has("key")).toBe(false);
});

it("client getter and setter", (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const originalClient = store.client;
	t.expect(originalClient).toBeDefined();
	const newStore = new KeyvEtcd(etcdUrl);
	store.client = newStore.client;
	t.expect(store.client).toBe(newStore.client);
	t.expect(store.client).not.toBe(originalClient);
});

it("lease getter and setter", (t) => {
	const store = new KeyvEtcd(etcdUrl, { ttl: 1000 });
	t.expect(store.lease).toBeDefined();
	store.lease = undefined;
	t.expect(store.lease).toBeUndefined();
});

it("has returns false for expired key", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	await store.set(key, "value", 1);
	await sleep(50);
	t.expect(await store.has(key)).toBe(false);
});

it("get returns null for expired key", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	await store.set(key, "value", 1);
	await sleep(50);
	t.expect(await store.get(key)).toBe(null);
});

it("handles legacy data without envelope in get", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	// Write raw value directly to etcd without envelope
	await store.client.put(store.formatKey(key)).value("raw-legacy-value");
	const result = await store.get(key);
	t.expect(result).toBe("raw-legacy-value");
});

it("handles legacy JSON data without v field in get", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key = faker.string.uuid();
	// Write JSON that is not our envelope format
	await store.client.put(store.formatKey(key)).value(JSON.stringify({ foo: "bar" }));
	const result = await store.get(key);
	// Should return the raw string since parsed.v is undefined
	t.expect(result).toBe(JSON.stringify({ foo: "bar" }));
});
