import type { RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvRedis, { createKeyv } from "../src/index.js";

describe("iterators", () => {
	beforeEach(async () => {
		const keyvRedis = new KeyvRedis();
		const client = (await keyvRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await keyvRedis.disconnect();
	});
	test("should be able to iterate over keys", async () => {
		const keyvRedis = new KeyvRedis();
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
		const keyvRedis = new KeyvRedis();
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
		const keyvRedis = new KeyvRedis();
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
		const keyvRedis = new KeyvRedis();
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

	test("should be able to pass undefined on connect to get localhost", async () => {
		const keyv = createKeyv();
		const keyvRedis = keyv.store as KeyvRedis<string>;
		expect((keyvRedis.client as RedisClientType).options?.url).toBe(
			"redis://localhost:6379",
		);
	});

	test("should go to the RedisClientOptions if passed in", async () => {
		const reconnectStrategy = (times: number) => Math.min(times * 50, 2000);

		const keyvRedis = new KeyvRedis({
			socket: {
				host: "localhost",
				port: 6379,
				reconnectStrategy,
			},
		});

		expect(
			(keyvRedis.client as RedisClientType).options?.socket?.reconnectStrategy,
		).toBe(reconnectStrategy);
	});
});
