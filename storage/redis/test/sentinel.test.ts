import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvRedis, { createSentinel } from "../src/index.js";

const defaultSentinelOptions = {
	name: "mymaster",
	sentinelRootNodes: [
		{
			host: "localhost",
			port: 26_379,
		},
		{
			host: "localhost",
			port: 26_380,
		},
		{
			host: "localhost",
			port: 26_381,
		},
	],
};

describe("KeyvRedis Sentinel", () => {
	beforeEach(async () => {
		const sentinel = createSentinel(defaultSentinelOptions);
		const keyvRedis = new KeyvRedis(sentinel);
		keyvRedis.noNamespaceAffectsAll = true;
		await keyvRedis.clear();
		await keyvRedis.disconnect();
	});

	test("should be able to connect to a sentinel", async () => {
		const sentinel = createSentinel(defaultSentinelOptions);

		const keyvRedis = new KeyvRedis(sentinel);

		expect(keyvRedis).toBeDefined();
		expect(keyvRedis.client).toEqual(sentinel);

		await keyvRedis.disconnect();
	});

	test("should be able to send in sentinel options", async () => {
		const keyvRedis = new KeyvRedis(defaultSentinelOptions);
		expect(keyvRedis.isSentinel()).toBe(true);
	});

	test("should be able to set the redis sentinel client", async () => {
		const sentinel = createSentinel(defaultSentinelOptions);

		const keyvRedis = new KeyvRedis();
		expect(keyvRedis.isSentinel()).toBe(false);

		keyvRedis.client = sentinel;
		expect(keyvRedis.client).toEqual(sentinel);
		expect(keyvRedis.isSentinel()).toBe(true);

		await keyvRedis.disconnect();
	});

	test("should be able to set a value", async () => {
		const sentinel = createSentinel(defaultSentinelOptions);

		const keyvRedis = new KeyvRedis(sentinel);

		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await keyvRedis.delete(key);

		const undefinedResult = await keyvRedis.get(key);
		expect(undefinedResult).toBeUndefined();

		await keyvRedis.set(key, value);

		const result = await keyvRedis.get(key);

		expect(result).toBe(value);

		await keyvRedis.delete(key);

		await keyvRedis.disconnect();
	});

	describe("KeyvRedis clear method", () => {
		test("should not throw an error on clear", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);

			const keyvRedis = new KeyvRedis(sentinel);

			let errorThrown = false;
			try {
				await keyvRedis.clear();
			} catch (error) {
				console.log(error);
				expect(error).toBeDefined();
				errorThrown = true;
			}

			expect(errorThrown).toBe(false);

			await keyvRedis.disconnect();
		});

		test("should do nothing if no keys on clear", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);

			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			await keyvRedis.clear();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await keyvRedis.set(key1, val1);
			await keyvRedis.set(key2, val2);
			await keyvRedis.set(key3, val3);
			await keyvRedis.clear();
			const value = await keyvRedis.get(key1);
			expect(value).toBeUndefined();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace and useUnlink to false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.useUnlink = false;
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await keyvRedis.set(key1, val1);
			await keyvRedis.set(key2, val2);
			await keyvRedis.set(key3, val3);
			await keyvRedis.clear();
			const value = await keyvRedis.get(key1);
			expect(value).toBeUndefined();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace but not the namespace ones", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const key3 = faker.string.uuid();
			const val3 = faker.lorem.word();
			keyvRedis.namespace = "ns1";
			await keyvRedis.set(key1, val1);
			keyvRedis.namespace = undefined;
			await keyvRedis.set(key2, val2);
			await keyvRedis.set(key3, val3);
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get(key1);
			expect(value).toBe(val1);
			await keyvRedis.disconnect();
		});

		test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = false;

			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const key3 = faker.string.uuid();
			const val3 = faker.lorem.word();
			keyvRedis.namespace = "ns1";
			await keyvRedis.set(key1, val1);
			keyvRedis.namespace = undefined;
			await keyvRedis.set(key2, val2);
			await keyvRedis.set(key3, val3);
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get(key1);
			expect(value).toBeDefined();
		});

		test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = true;

			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			const key3 = faker.string.uuid();
			const val3 = faker.lorem.word();
			keyvRedis.namespace = "ns1";
			await keyvRedis.set(key1, val1);
			keyvRedis.namespace = undefined;
			await keyvRedis.set(key2, val2);
			await keyvRedis.set(key3, val3);
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get(key1);
			expect(value).toBeUndefined();
		});

		test("should clear namespace but not other ones", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const key1 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const key2 = faker.string.uuid();
			const val2 = faker.lorem.word();
			keyvRedis.namespace = "ns1";
			await keyvRedis.set(key1, val1);
			keyvRedis.namespace = "ns2";
			await keyvRedis.set(key2, val2);
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get(key1);
			expect(value).toBe(val1);
			await keyvRedis.disconnect();
		});
	});

	describe("KeyvRedis Iterators", () => {
		test("should no throw an error on iterator", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const iteratorNamespace = faker.string.uuid();

			let errorThrown = false;
			try {
				const keys = [];
				const values = [];
				for await (const [key, value] of keyvRedis.iterator(iteratorNamespace)) {
					keys.push(key);
					values.push(value);
				}
			} catch (error) {
				console.log(error);
				expect(error).toBeDefined();
				errorThrown = true;
			}

			expect(errorThrown).toBe(false);
		});

		test("should be able to iterate over keys", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const key1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			const val3 = faker.lorem.word();
			await keyvRedis.set(key1, val1);
			await keyvRedis.set(key2, val2);
			await keyvRedis.set(key3, val3);
			const keys = [];
			for await (const [key] of keyvRedis.iterator()) {
				keys.push(key);
			}

			expect(keys).toContain(key1);
			expect(keys).toContain(key2);
			expect(keys).toContain(key3);
			await keyvRedis.disconnect();
		});

		test("should be able to iterate over keys by namespace", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const namespace = "ns1";
			const noNsKey1 = faker.string.uuid();
			const noNsKey2 = faker.string.uuid();
			const noNsKey3 = faker.string.uuid();
			const noNsVal1 = faker.lorem.word();
			const noNsVal2 = faker.lorem.word();
			const noNsVal3 = faker.lorem.word();
			await keyvRedis.set(noNsKey1, noNsVal1);
			await keyvRedis.set(noNsKey2, noNsVal2);
			await keyvRedis.set(noNsKey3, noNsVal3);
			keyvRedis.namespace = namespace;
			const nsKey1 = faker.string.uuid();
			const nsKey2 = faker.string.uuid();
			const nsKey3 = faker.string.uuid();
			const nsVal1 = faker.lorem.word();
			const nsVal2 = faker.lorem.word();
			const nsVal3 = faker.lorem.word();
			await keyvRedis.set(nsKey1, nsVal1);
			await keyvRedis.set(nsKey2, nsVal2);
			await keyvRedis.set(nsKey3, nsVal3);
			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator(namespace)) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(nsKey1);
			expect(keys).toContain(nsKey2);
			expect(keys).toContain(nsKey3);
			expect(values).toContain(nsVal1);
			expect(values).toContain(nsVal2);
			expect(values).toContain(nsVal3);

			await keyvRedis.disconnect();
		});

		test("should be able to iterate over all keys if namespace is undefined and noNamespaceAffectsAll is true", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = true;

			const key1 = faker.string.uuid();
			const val1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const val2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val3 = faker.string.uuid();
			keyvRedis.namespace = "ns1";
			await keyvRedis.set(key1, val1);
			keyvRedis.namespace = "ns2";
			await keyvRedis.set(key2, val2);
			keyvRedis.namespace = undefined;
			await keyvRedis.set(key3, val3);

			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(`ns1::${key1}`);
			expect(keys).toContain(`ns2::${key2}`);
			expect(keys).toContain(key3);
			expect(values).toContain(val1);
			expect(values).toContain(val2);
			expect(values).toContain(val3);
		});

		test("should only iterate over keys with no namespace if name is undefined set and noNamespaceAffectsAll is false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = false;

			const key1 = faker.string.uuid();
			const val1 = faker.string.uuid();
			const key2 = faker.string.uuid();
			const val2 = faker.string.uuid();
			const key3 = faker.string.uuid();
			const val3 = faker.string.uuid();
			keyvRedis.namespace = "ns1";
			await keyvRedis.set(key1, val1);
			keyvRedis.namespace = "ns2";
			await keyvRedis.set(key2, val2);
			keyvRedis.namespace = undefined;
			await keyvRedis.set(key3, val3);

			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain(key3);
			expect(values).toContain(val3);

			expect(keys).not.toContain(key1);
			expect(keys).not.toContain(`ns1::${key1}`);
			expect(keys).not.toContain(`ns2::${key2}`);
			expect(keys).not.toContain(key2);
			expect(values).not.toContain(val1);
			expect(values).not.toContain(val2);
		});
	});
});
