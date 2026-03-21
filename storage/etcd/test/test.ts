import { faker } from "@faker-js/faker";
import keyvTestSuite, { keyvIteratorTests } from "@keyv/test-suite";
import { Keyv } from "keyv";
import * as test from "vitest";
import KeyvEtcd from "../src/index.js";

const etcdUrl = "etcd://127.0.0.1:2379";

const store = () => new KeyvEtcd({ uri: etcdUrl, busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.it("default options", (t) => {
	const store = new KeyvEtcd();
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		dialect: "etcd",
		namespace: undefined,
	});
});

test.it("enable ttl using default url", (t) => {
	const store = new KeyvEtcd({ ttl: 1000 });
	t.expect(store.opts).toEqual({
		url: "127.0.0.1:2379",
		ttl: 1000,
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
		ttl: true,
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
		ttl: true,
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
	t.expect(results.get(`${namespace}:${key1}`)).toBe(value1);
	t.expect(results.get(`${namespace}:${key2}`)).toBe(value2);
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
