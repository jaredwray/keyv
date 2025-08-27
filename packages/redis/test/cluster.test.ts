import { beforeEach, describe, expect, test, vitest } from "vitest";
import KeyvRedis, { createCluster } from "../src/index.js";

const defaultClusterOptions = {
	rootNodes: [
		{
			url: "redis://localhost:7001",
		},
		{
			url: "redis://localhost:7002",
		},
		{
			url: "redis://localhost:7003",
		},
	],
	useReplicas: true,
};

describe("KeyvRedis Cluster", () => {
	beforeEach(async () => {
		const cluster = createCluster(defaultClusterOptions);
		const keyvRedis = new KeyvRedis(cluster);
		keyvRedis.noNamespaceAffectsAll = true;
		await keyvRedis.clear();
		await keyvRedis.disconnect();
	});

	test("should be able to connect to a cluster", async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis(cluster);

		expect(keyvRedis).toBeDefined();
		expect(keyvRedis.client).toEqual(cluster);

		await keyvRedis.disconnect();
	});

	test("should be able to send in cluster options", async () => {
		const keyvRedis = new KeyvRedis(defaultClusterOptions);
		expect(keyvRedis.isCluster()).toBe(true);
	});

	test("should be able to set the redis cluster client", async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis();
		expect(keyvRedis.isCluster()).toBe(false);

		keyvRedis.client = cluster;
		expect(keyvRedis.client).toEqual(cluster);
		expect(keyvRedis.isCluster()).toBe(true);

		await keyvRedis.disconnect();
	});

	test("should be able to set a value", async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis(cluster);

		await keyvRedis.delete("test-cl1");

		const undefinedResult = await keyvRedis.get("test-cl1");
		expect(undefinedResult).toBeUndefined();

		await keyvRedis.set("test-cl1", "test");

		const result = await keyvRedis.get("test-cl1");

		expect(result).toBe("test");

		await keyvRedis.delete("test-cl1");

		await keyvRedis.disconnect();
	});

	test("should split getMany by slot to avoid CROSSSLOT errors", async () => {
		const cluster = createCluster(defaultClusterOptions);
		await cluster.connect();

		const spies = cluster.masters.map((master) =>
			vitest.spyOn(master.client, "mGet"),
		);

		const keyvRedis = new KeyvRedis(cluster);
		// These keys may hash to different slots, so multiple mGet calls may be needed
		await keyvRedis.getMany(["test-cl1", "test-cl2", "test-cl3", "test-cl4"]);

		// Verify that mGet was called (may be multiple times per master if keys hash to different slots)
		let totalCalls = 0;
		spies.forEach((spy) => {
			totalCalls += spy.mock.calls.length;
		});

		// Should have made at least one call
		expect(totalCalls).toBeGreaterThan(0);

		// Each call should only contain keys from the same slot (no CROSSSLOT errors)
		// The test passes if no error was thrown during getMany
	});

	describe("KeyvRedis clear method", () => {
		test("should not throw an error on clear", async () => {
			const cluster = createCluster(defaultClusterOptions);

			const keyvRedis = new KeyvRedis(cluster);

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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);

			await keyvRedis.clear();
			keyvRedis.namespace = "ns1";
			await keyvRedis.clear();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
			await keyvRedis.set("foo90", "bar");
			await keyvRedis.set("foo902", "bar2");
			await keyvRedis.set("foo903", "bar3");
			await keyvRedis.clear();
			const value = await keyvRedis.get("foo90");
			expect(value).toBeUndefined();
			await keyvRedis.disconnect();
		});

		test("should clear with no namespace and useUnlink to false", async () => {
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);

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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
			const cluster = createCluster(defaultClusterOptions);
			const keyvRedis = new KeyvRedis(cluster);
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
