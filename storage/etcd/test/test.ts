import { faker } from "@faker-js/faker";
import keyvTestSuite, { keyvIteratorTests } from "@keyv/test-suite";
import { Keyv } from "keyv";
import * as test from "vitest";
import KeyvEtcd, { createKeyv } from "../src/index.js";

const etcdUrl = "etcd://127.0.0.1:2379";

const store = () => new KeyvEtcd({ uri: etcdUrl, busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.it("default options", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: undefined,
		busyTimeout: undefined,
		dialect: "etcd",
		namespace: undefined,
	});
});

test.it("enable ttl using default url", (t) => {
	const store = new KeyvEtcd({ ttl: 1000 });
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: 1000,
		busyTimeout: undefined,
		dialect: "etcd",
		namespace: undefined,
	});
	t.expect(store.lease).toBeDefined();
});

test.it("disable ttl using default url", (t) => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd({ ttl: true });
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: undefined,
		busyTimeout: undefined,
		dialect: "etcd",
		namespace: undefined,
	});
	t.expect(store.lease).toBeUndefined();
});

test.it("enable ttl using url", (t) => {
	const store = new KeyvEtcd({
		url: "127.0.0.1:2379",
		ttl: 1000,
	});
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: 1000,
		busyTimeout: undefined,
		dialect: "etcd",
		namespace: undefined,
	});
	t.expect(store.lease).toBeDefined();
});

test.it("enable ttl using url and options", (t) => {
	const store = new KeyvEtcd("127.0.0.1:2379", { ttl: 1000 });
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: 1000,
		busyTimeout: undefined,
		dialect: "etcd",
		namespace: undefined,
	});
	t.expect(store.lease).toBeDefined();
});

test.it("disable ttl using url and options", (t) => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd("127.0.0.1:2379", { ttl: true });
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: undefined,
		busyTimeout: undefined,
		dialect: "etcd",
		namespace: undefined,
	});
	t.expect(store.lease).toBeUndefined();
});

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

test.it("KeyvEtcd respects default tll option", async (t) => {
	const keyv = new KeyvEtcd(etcdUrl, { ttl: 1000 });
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
	await sleep(3000);
	t.expect(await keyv.get(key)).toBe(null);
});

test.it(".delete() with key as number", async (t) => {
	const store = new KeyvEtcd({ uri: etcdUrl });
	// @ts-expect-error - key needs be a string, just for test
	t.expect(await store.delete(123)).toBeFalsy();
});

test.it(".clear() with default namespace", async (t) => {
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

test.it(".clear() with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	await store.clear();
	t.expect(await store.get(key)).toBe(null);
});

test.it("close connection successfully", async (t) => {
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

test.it("iterator with namespace", async (t) => {
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

test.it("iterator without namespace", async (t) => {
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

test.it("get/set with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await store.set(key, value);
	t.expect(await store.get(key)).toBe(value);
});

test.it("delete with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	t.expect(await store.delete(key)).toBe(true);
	t.expect(await store.get(key)).toBe(null);
});

test.it("has with namespace", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const namespace = faker.string.alphanumeric(10);
	store.namespace = namespace;
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.word());
	t.expect(await store.has(key)).toBe(true);
	await store.delete(key);
	t.expect(await store.has(key)).toBe(false);
});

test.it("getMany with namespace", async (t) => {
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

test.it("formatKey prefixes key and avoids double prefix", (t) => {
	const store = new KeyvEtcd();
	store.namespace = "ns";
	t.expect(store.formatKey("key")).toBe("ns:key");
	t.expect(store.formatKey("ns:key")).toBe("ns:key");
	store.namespace = undefined;
	t.expect(store.formatKey("key")).toBe("key");
});

test.it("createKeyPrefix returns prefixed key when namespace is set", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.createKeyPrefix("key", "ns")).toBe("ns:key");
	t.expect(store.createKeyPrefix("key")).toBe("key");
	t.expect(store.createKeyPrefix("key", undefined)).toBe("key");
});

test.it("removeKeyPrefix strips prefix when namespace is set", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.removeKeyPrefix("ns:key", "ns")).toBe("key");
	t.expect(store.removeKeyPrefix("key")).toBe("key");
	t.expect(store.removeKeyPrefix("key", undefined)).toBe("key");
});

test.it("namespace getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.namespace).toBeUndefined();
	store.namespace = "test-ns";
	t.expect(store.namespace).toBe("test-ns");
	store.namespace = undefined;
	t.expect(store.namespace).toBeUndefined();
});

test.it("keyPrefixSeparator getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.keyPrefixSeparator).toBe(":");
	store.keyPrefixSeparator = "::";
	t.expect(store.keyPrefixSeparator).toBe("::");
	t.expect(store.createKeyPrefix("key", "ns")).toBe("ns::key");
});

test.it("setMany sets multiple keys", async (t) => {
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

test.it("setMany emits error on failure", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	const errors: unknown[] = [];
	store.on("error", (error: unknown) => {
		errors.push(error);
	});
	await store.setMany([{ key: "key", value: "value" }]);
	t.expect(errors.length).toBeGreaterThan(0);
});

test.it("hasMany checks multiple keys", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const key1 = faker.string.uuid();
	const key2 = faker.string.uuid();
	const key3 = faker.string.uuid();
	await store.set(key1, faker.lorem.word());
	await store.set(key2, faker.lorem.word());
	const results = await store.hasMany([key1, key2, key3]);
	t.expect(results).toEqual([true, true, false]);
});

test.it("url getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.url).toBe("127.0.0.1:2379");
	store.url = "10.0.0.1:2379";
	t.expect(store.url).toBe("10.0.0.1:2379");
});

test.it("ttl getter and setter", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.ttl).toBeUndefined();
	store.ttl = 5000;
	t.expect(store.ttl).toBe(5000);
	store.ttl = undefined;
	t.expect(store.ttl).toBeUndefined();
});

test.it("busyTimeout getter and setter", (t) => {
	const store = new KeyvEtcd({ busyTimeout: 3000 });
	t.expect(store.busyTimeout).toBe(3000);
	store.busyTimeout = 5000;
	t.expect(store.busyTimeout).toBe(5000);
	store.busyTimeout = undefined;
	t.expect(store.busyTimeout).toBeUndefined();
});

test.it("dialect getter is always etcd", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.dialect).toBe("etcd");
});

test.it("createKeyv returns a Keyv instance with KeyvEtcd store", (t) => {
	const keyv = createKeyv(etcdUrl);
	t.expect(keyv).toBeInstanceOf(Keyv);
	t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
});

test.it("createKeyv with options", (t) => {
	const keyv = createKeyv(etcdUrl, { ttl: 5000 });
	t.expect(keyv).toBeInstanceOf(Keyv);
	t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
	t.expect((keyv.store as KeyvEtcd).ttl).toBe(5000);
});

test.it("createKeyv with options object", (t) => {
	const keyv = createKeyv({ url: "127.0.0.1:2379", ttl: 3000 });
	t.expect(keyv).toBeInstanceOf(Keyv);
	t.expect(keyv.store).toBeInstanceOf(KeyvEtcd);
	t.expect((keyv.store as KeyvEtcd).ttl).toBe(3000);
});

test.it("createKeyv set and get", async (t) => {
	const keyv = createKeyv(etcdUrl);
	const key = faker.string.uuid();
	const value = faker.lorem.word();
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
	await keyv.delete(key);
});

test.it("get emits error on disconnected client", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	const errors: unknown[] = [];
	store.on("error", (error: unknown) => {
		errors.push(error);
	});
	await store.get("key");
	t.expect(errors.length).toBeGreaterThan(0);
});

test.it("delete emits error on disconnected client", async (t) => {
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

test.it("clear emits error on disconnected client", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	const errors: unknown[] = [];
	store.on("error", (error: unknown) => {
		errors.push(error);
	});
	await store.clear();
	t.expect(errors.length).toBeGreaterThan(0);
});

test.it("has returns false on disconnected client", async (t) => {
	const store = new KeyvEtcd(etcdUrl);
	await store.disconnect();
	t.expect(await store.has("key")).toBe(false);
});

test.it("client getter and setter", (t) => {
	const store = new KeyvEtcd(etcdUrl);
	const originalClient = store.client;
	t.expect(originalClient).toBeDefined();
	const newStore = new KeyvEtcd(etcdUrl);
	store.client = newStore.client;
	t.expect(store.client).toBe(newStore.client);
	t.expect(store.client).not.toBe(originalClient);
});

test.it("lease getter and setter", (t) => {
	const store = new KeyvEtcd(etcdUrl, { ttl: 1000 });
	t.expect(store.lease).toBeDefined();
	store.lease = undefined;
	t.expect(store.lease).toBeUndefined();
});
