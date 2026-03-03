import { faker } from "@faker-js/faker";
import keyvTestSuite, { keyvIteratorTests } from "@keyv/test-suite";
import Redis, { type Cluster } from "iovalkey";
import Keyv from "keyv";
import tk from "timekeeper";
import * as test from "vitest";
import KeyvValkey, { createKeyv } from "../src/index.js";

const REDIS_HOST = "localhost:6370";
const redisURI = `redis://${REDIS_HOST}`;

const store = () => new KeyvValkey(redisURI);

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.it("reuse a redis instance", async (t) => {
	const redis = new Redis(redisURI);
	// @ts-expect-error foo doesn't exist on Redis
	redis.foo = "bar";
	const keyv = new KeyvValkey(redis);
	t.expect(keyv.client.foo).toBe("bar");

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
});

test.it("set an undefined key", async (t) => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvValkey(redis);

	const key = faker.string.alphanumeric(10);
	await keyv.set(key, undefined);
	const result = await keyv.get(key);
	t.expect(result).toBe(undefined);
});

test.it("Async Iterator 0 element test", async (t) => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvValkey(redis);
	await keyv.clear();
	const iterator = keyv.iterator("keyv");
	const key = await iterator.next();
	t.expect(key.value).toBe(undefined);
});

test.it("close connection successfully", async (t) => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvValkey(redis);
	const key = faker.string.alphanumeric(10);
	t.expect(await keyv.get(key)).toBe(undefined);
	await keyv.disconnect();
	try {
		await keyv.get(key);
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("clear method with empty keys should not error", async (t) => {
	try {
		const keyv = new KeyvValkey(redisURI);
		t.expect(await keyv.clear()).toBeUndefined();
	} catch {
		t.expect.fail();
	}
});

test.it(".clear() cleaned namespace", async (t) => {
	// Setup
	const keyvRedis = new KeyvValkey(redisURI);
	const ns = faker.string.alphanumeric(8);
	const keyv = new Keyv(keyvRedis, {
		namespace: ns,
	});

	const length = 1;
	const key = [...Array.from({ length }).keys()].join("");

	await keyv.set(key, "value", 1);

	await new Promise((r) => {
		setTimeout(r, 250);
	});

	await keyv.clear();
	await keyv.disconnect();

	// Test
	const redis = new Redis(redisURI);

	// Namespace should also expire after calling clear
	t.expect(await redis.exists(`namespace:${ns}`)).toBe(0);

	// Memory of each key should be null
	t.expect(await redis.memory("USAGE", `namespace:${ns}`)).toBe(null);
});

test.it("Keyv stores ttl without const", async (t) => {
	const keyv = new Keyv(new KeyvValkey(redisURI));
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value, 100);
	t.expect(await keyv.get(key)).toBe(value);
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get(key)).toBe(undefined);
});

test.it("should handle KeyvOptions without uri", (t) => {
	const options = {
		isCluster: true,
	};
	const keyv = new KeyvValkey(options as Cluster);
	t.expect(keyv.client instanceof Redis).toBeTruthy();
});

test.it("should handle KeyvOptions with family option", (t) => {
	const options = {
		options: {},
		family: 4,
	};
	const keyv = new KeyvValkey(options);
	t.expect(keyv.client instanceof Redis).toBeTruthy();
});

test.it("should handle RedisOptions", (t) => {
	const options = {
		db: 2,
		connectionName: "name",
	};
	const keyv = new KeyvValkey(options);
	t.expect(keyv.client instanceof Redis).toBeTruthy();
});

test.it("set method should use sets when useSets is false", async (t) => {
	const options = { useSets: false };
	const keyv = new KeyvValkey(options);

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);

	const result = await keyv.get(key);
	t.expect(result).toBe(value);
});

test.it("clear method when useSets is false", async (t) => {
	const options = { useSets: false };
	const keyv = new KeyvValkey(options);

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);

	await keyv.set(key1, val1);
	await keyv.set(key2, val2);

	await keyv.clear();

	const value = await keyv.get(key1);
	const value2 = await keyv.get(key2);
	t.expect(value).toBe(undefined);
	t.expect(value2).toBe(undefined);
});

test.it(
	"clear method when useSets is false and empty keys should not error",
	async (t) => {
		const options = { useSets: false };
		const keyv = new KeyvValkey(options);
		t.expect(await keyv.clear()).toBeUndefined();
	},
);

test.it("when passing in ioredis set the options.useSets", (t) => {
	const options = { useSets: false };
	const redis = new Redis(redisURI);
	const keyv = new KeyvValkey(redis, options);

	t.expect(keyv.opts.useSets).toBe(false);
});

test.it("del should work when not using useSets", async (t) => {
	const options = { useSets: false };
	const redis = new Redis(redisURI);
	const keyv = new KeyvValkey(redis, options);

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);

	await keyv.delete(key);

	const result = await keyv.get(key);

	t.expect(result).toBe(undefined);
});

test.it("del should work when using useSets", async (t) => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvValkey(redis, { useSets: true });
	const ns = `del-sets-${faker.string.alphanumeric(8)}`;
	keyv.namespace = ns;

	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);

	const result = await keyv.delete(key);
	t.expect(result).toBe(true);
	t.expect(await keyv.get(key)).toBe(undefined);

	const resultFalse = await keyv.delete("nonexistent");
	t.expect(resultFalse).toBe(false);
});

test.it("can create a full keyv instance with a uri", async (t) => {
	const keyv = createKeyv(redisURI);
	t.expect(keyv).toBeTruthy();
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.set(key, value);
	t.expect(await keyv.get(key)).toBe(value);
});

test.it("should have default useSets as false", (t) => {
	const keyv = new KeyvValkey(redisURI);
	t.expect(keyv.useSets).toBe(false);
});

test.it("should allow setting useSets via setter", (t) => {
	const keyv = new KeyvValkey(redisURI);
	keyv.useSets = false;
	t.expect(keyv.useSets).toBe(false);
	t.expect(keyv.opts.useSets).toBe(false);
});

test.it("should allow setting and getting namespace via setter", (t) => {
	const keyv = new KeyvValkey(redisURI);
	t.expect(keyv.namespace).toBeUndefined();
	keyv.namespace = "test-ns";
	t.expect(keyv.namespace).toBe("test-ns");
});

test.it("should allow setting redis instance via setter", (t) => {
	const keyv = new KeyvValkey(redisURI);
	const newRedis = new Redis(redisURI);
	keyv.client = newRedis;
	t.expect(keyv.client).toBe(newRedis);
});

test.it("opts getter should return dialect as redis", (t) => {
	const keyv = new KeyvValkey(redisURI);
	t.expect(keyv.opts.dialect).toBe("redis");
});

test.it("opts getter should reflect current useSets value", (t) => {
	const keyv = new KeyvValkey(redisURI);
	t.expect(keyv.opts.useSets).toBe(false);
	keyv.useSets = true;
	t.expect(keyv.opts.useSets).toBe(true);
});

test.it("deprecated useRedisSets getter/setter should still work", (t) => {
	const keyv = new KeyvValkey(redisURI);
	t.expect(keyv.useRedisSets).toBe(false);
	keyv.useRedisSets = true;
	t.expect(keyv.useRedisSets).toBe(true);
	t.expect(keyv.useSets).toBe(true);
});

test.it("setMany should set multiple keys", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	const val3 = faker.string.alphanumeric(10);
	await keyv.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
		{ key: key3, value: val3 },
	]);
	const values = await keyv.getMany([key1, key2, key3]);
	t.expect(values).toEqual([val1, val2, val3]);
	await keyv.disconnect();
});

test.it("setMany with TTL should expire keys", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key = faker.string.alphanumeric(10);
	const value = faker.string.alphanumeric(10);
	await keyv.setMany([{ key, value, ttl: 100 }]);
	t.expect(await keyv.get(key)).toBe(value);
	await new Promise((r) => {
		setTimeout(r, 150);
	});
	t.expect(await keyv.get(key)).toBe(undefined);
	await keyv.disconnect();
});

test.it("setMany with empty array should not error", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	await keyv.setMany([]);
	t.expect(true).toBe(true);
	await keyv.disconnect();
});

test.it("setMany should skip undefined values", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	await keyv.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: undefined },
	]);
	t.expect(await keyv.get(key1)).toBe(val1);
	t.expect(await keyv.get(key2)).toBe(undefined);
	await keyv.disconnect();
});

test.it("setMany with all undefined values should not error", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	await keyv.setMany([
		{ key: key1, value: undefined },
		{ key: key2, value: undefined },
	]);
	t.expect(await keyv.get(key1)).toBe(undefined);
	t.expect(await keyv.get(key2)).toBe(undefined);
	await keyv.disconnect();
});

test.it("setMany with useSets should track keys in set", async (t) => {
	const keyv = new KeyvValkey(redisURI, { useSets: true });
	const ns = `setmany-${faker.string.alphanumeric(8)}`;
	keyv.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await keyv.setMany([
		{ key: key1, value: val1 },
		{ key: key2, value: val2 },
	]);
	t.expect(await keyv.get(key1)).toBe(val1);
	t.expect(await keyv.get(key2)).toBe(val2);
	await keyv.clear();
	t.expect(await keyv.get(key1)).toBe(undefined);
	await keyv.disconnect();
});

test.it("hasMany should return array of booleans", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	await keyv.set(key1, faker.string.alphanumeric(10));
	await keyv.set(key2, faker.string.alphanumeric(10));
	const results = await keyv.hasMany([key1, key2, key3]);
	t.expect(results).toEqual([true, true, false]);
	await keyv.disconnect();
});

test.it("hasMany with empty array should return empty array", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const results = await keyv.hasMany([]);
	t.expect(results).toEqual([]);
	await keyv.disconnect();
});

test.it("deleteMany should batch delete keys", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await keyv.set(key1, val1);
	await keyv.set(key2, val2);
	const result = await keyv.deleteMany([key1, key2]);
	t.expect(result).toBe(true);
	t.expect(await keyv.get(key1)).toBe(undefined);
	t.expect(await keyv.get(key2)).toBe(undefined);
	await keyv.disconnect();
});

test.it("deleteMany with nonexistent keys should return false", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const result = await keyv.deleteMany([key1, key2]);
	t.expect(result).toBe(false);
	await keyv.disconnect();
});

test.it("deleteMany with empty array should return false", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const result = await keyv.deleteMany([]);
	t.expect(result).toBe(false);
	await keyv.disconnect();
});

test.it("clear with useSets should clear keys tracked in set", async (t) => {
	const keyv = new KeyvValkey(redisURI, { useSets: true });
	const ns = `clear-sets-${faker.string.alphanumeric(8)}`;
	keyv.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await keyv.set(key1, val1);
	await keyv.set(key2, val2);
	t.expect(await keyv.get(key1)).toBe(val1);
	await keyv.clear();
	t.expect(await keyv.get(key1)).toBe(undefined);
	t.expect(await keyv.get(key2)).toBe(undefined);
	await keyv.disconnect();
});

test.it("iterator without namespace should not error", async (t) => {
	const keyv = new KeyvValkey(redisURI);
	const iterator = keyv.iterator();
	const result = await iterator.next();
	t.expect(result.done === true || Array.isArray(result.value)).toBe(true);
	await keyv.disconnect();
});

test.it("createKeyv without arguments should use default uri", async (t) => {
	const keyv = createKeyv();
	t.expect(keyv).toBeTruthy();
	await keyv.disconnect();
});

test.it("iterator with useSets should iterate keys", async (t) => {
	const keyvRedis = new KeyvValkey(redisURI, { useSets: true });
	const ns = `iter-sets-${faker.string.alphanumeric(8)}`;
	const keyv = new Keyv(keyvRedis, { namespace: ns });

	await keyv.clear();
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await keyv.set(key1, val1);
	await keyv.set(key2, val2);

	const collected = new Map<string, string>();
	for await (const [key, value] of keyvRedis.iterator(ns)) {
		collected.set(key, value);
	}

	t.expect(collected.size).toBe(2);
	await keyv.clear();
	await keyv.disconnect();
});

test.it("deleteMany with useSets should remove from set", async (t) => {
	const keyv = new KeyvValkey(redisURI, { useSets: true });
	const ns = `delmany-${faker.string.alphanumeric(8)}`;
	keyv.namespace = ns;
	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	await keyv.set(key1, val1);
	await keyv.set(key2, val2);
	await keyv.deleteMany([key1, key2]);
	t.expect(await keyv.get(key1)).toBe(undefined);
	t.expect(await keyv.get(key2)).toBe(undefined);
	await keyv.disconnect();
});

test.it(
	"iterator should iterate over multiple keys in namespace",
	async (t) => {
		const redis = new Redis(redisURI);
		const keyvRedis = new KeyvValkey(redis);
		const ns = `iterator-${faker.string.alphanumeric(8)}`;
		const keyv = new Keyv(keyvRedis, { namespace: ns });

		// Clear any existing keys
		await keyv.clear();

		// Set multiple keys
		const testData: Record<string, string> = {};
		for (let i = 0; i < 4; i++) {
			const key = faker.string.alphanumeric(10);
			const value = faker.string.alphanumeric(10);
			testData[key] = value;
		}

		for (const [key, value] of Object.entries(testData)) {
			await keyv.set(key, value);
		}

		// Iterate and collect all keys/values
		const collected = new Map<string, string>();
		for await (const [key, value] of keyvRedis.iterator(ns)) {
			collected.set(key, value);
		}

		// Validate all keys exist
		t.expect(collected.size).toBe(Object.keys(testData).length);
		for (const [key, value] of Object.entries(testData)) {
			const fullKey = `${ns}:${key}`;
			t.expect(collected.has(fullKey)).toBe(true);
			t.expect(collected.get(fullKey)).toBe(JSON.stringify({ value }));
		}

		await keyv.disconnect();
	},
);
