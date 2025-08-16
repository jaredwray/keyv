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

		await keyvRedis.delete("test-cl1");

		const undefinedResult = await keyvRedis.get("test-cl1");
		expect(undefinedResult).toBeUndefined();

		await keyvRedis.set("test-cl1", "test");

		const result = await keyvRedis.get("test-cl1");

		expect(result).toBe("test");

		await keyvRedis.delete("test-cl1");

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
			await keyvRedis.set("foo90", "bar");
			await keyvRedis.set("foo902", "bar2");
			await keyvRedis.set("foo903", "bar3");
			await keyvRedis.clear();
			const value = await keyvRedis.get("foo90");
			expect(value).toBeUndefined();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace and useUnlink to false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.useUnlink = false;
			await keyvRedis.set("foo90", "bar");
			await keyvRedis.set("foo902", "bar2");
			await keyvRedis.set("foo903", "bar3");
			await keyvRedis.clear();
			const value = await keyvRedis.get("foo90");
			expect(value).toBeUndefined();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace but not the namespace ones", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.namespace = "ns1";
			await keyvRedis.set("foo91", "bar");
			keyvRedis.namespace = undefined;
			await keyvRedis.set("foo912", "bar2");
			await keyvRedis.set("foo913", "bar3");
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get("foo91");
			expect(value).toBe("bar");
			await keyvRedis.disconnect();
		});

		test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = false;

			keyvRedis.namespace = "ns1";
			await keyvRedis.set("foo91", "bar");
			keyvRedis.namespace = undefined;
			await keyvRedis.set("foo912", "bar2");
			await keyvRedis.set("foo913", "bar3");
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get("foo91");
			expect(value).toBeDefined();
		});

		test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = true;

			keyvRedis.namespace = "ns1";
			await keyvRedis.set("foo91", "bar");
			keyvRedis.namespace = undefined;
			await keyvRedis.set("foo912", "bar2");
			await keyvRedis.set("foo913", "bar3");
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get("foo91");
			expect(value).toBeUndefined();
		});

		test("should clear namespace but not other ones", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.namespace = "ns1";
			await keyvRedis.set("foo921", "bar");
			keyvRedis.namespace = "ns2";
			await keyvRedis.set("foo922", "bar2");
			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			const value = await keyvRedis.get("foo921");
			expect(value).toBe("bar");
			await keyvRedis.disconnect();
		});
	});

	describe("KeyvRedis Iterators", () => {
		test("should no throw an error on iterator", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);

			let errorThrown = false;
			try {
				const keys = [];
				const values = [];
				for await (const [key, value] of keyvRedis.iterator("foo")) {
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
			await keyvRedis.set("foo95", "bar");
			await keyvRedis.set("foo952", "bar2");
			await keyvRedis.set("foo953", "bar3");
			const keys = [];
			for await (const [key] of keyvRedis.iterator()) {
				keys.push(key);
			}

			expect(keys).toContain("foo95");
			expect(keys).toContain("foo952");
			expect(keys).toContain("foo953");
			await keyvRedis.disconnect();
		});

		test("should be able to iterate over keys by namespace", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			const namespace = "ns1";
			await keyvRedis.set("foo96", "bar");
			await keyvRedis.set("foo962", "bar2");
			await keyvRedis.set("foo963", "bar3");
			keyvRedis.namespace = namespace;
			await keyvRedis.set("foo961", "bar");
			await keyvRedis.set("foo9612", "bar2");
			await keyvRedis.set("foo9613", "bar3");
			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator(namespace)) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain("foo961");
			expect(keys).toContain("foo9612");
			expect(keys).toContain("foo9613");
			expect(values).toContain("bar");
			expect(values).toContain("bar2");
			expect(values).toContain("bar3");

			await keyvRedis.disconnect();
		});

		test("should be able to iterate over all keys if namespace is undefined and noNamespaceAffectsAll is true", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = true;

			keyvRedis.namespace = "ns1";
			await keyvRedis.set("foo1", "bar1");
			keyvRedis.namespace = "ns2";
			await keyvRedis.set("foo2", "bar2");
			keyvRedis.namespace = undefined;
			await keyvRedis.set("foo3", "bar3");

			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain("ns1::foo1");
			expect(keys).toContain("ns2::foo2");
			expect(keys).toContain("foo3");
			expect(values).toContain("bar1");
			expect(values).toContain("bar2");
			expect(values).toContain("bar3");
		});

		test("should only iterate over keys with no namespace if name is undefined set and noNamespaceAffectsAll is false", async () => {
			const sentinel = createSentinel(defaultSentinelOptions);
			const keyvRedis = new KeyvRedis(sentinel);
			keyvRedis.noNamespaceAffectsAll = false;

			keyvRedis.namespace = "ns1";
			await keyvRedis.set("foo1", "bar1");
			keyvRedis.namespace = "ns2";
			await keyvRedis.set("foo2", "bar2");
			keyvRedis.namespace = undefined;
			await keyvRedis.set("foo3", "bar3");

			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator()) {
				keys.push(key);
				values.push(value);
			}

			expect(keys).toContain("foo3");
			expect(values).toContain("bar3");

			expect(keys).not.toContain("foo1");
			expect(keys).not.toContain("ns1::foo1");
			expect(keys).not.toContain("ns2::foo2");
			expect(keys).not.toContain("foo2");
			expect(values).not.toContain("bar1");
			expect(values).not.toContain("bar2");
		});
	});
});
