import { faker } from "@faker-js/faker";
import { delay } from "@keyv/test-suite";
import type { RedisClientType } from "@redis/client";
import { beforeEach, describe, expect, test } from "vitest";
import KeyvRedis from "../src/index.js";

describe("Namespace", () => {
	beforeEach(async () => {
		const keyvRedis = new KeyvRedis();
		const client = (await keyvRedis.getClient()) as RedisClientType;
		await client.flushDb();
		await keyvRedis.disconnect();
	});

	test("if there is a namespace on key prefix", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = "ns1";
		const testKey = faker.string.uuid();
		const key = keyvRedis.createKeyPrefix(testKey, "ns2");
		expect(key).toBe(`ns2::${testKey}`);
	});

	test("if no namespace on key prefix and no default namespace", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.namespace = undefined;
		const testKey = faker.string.uuid();
		const key = keyvRedis.createKeyPrefix(testKey);
		expect(key).toBe(testKey);
	});

	test("should clear with no namespace", async () => {
		const keyvRedis = new KeyvRedis();
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
		const keyvRedis = new KeyvRedis();
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
		const keyvRedis = new KeyvRedis();
		const client = (await keyvRedis.getClient()) as RedisClientType;
		await client.flushDb();
		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		keyvRedis.namespace = "ns1";
		await keyvRedis.set(nsKey, nsVal);
		keyvRedis.namespace = undefined;
		await keyvRedis.set(noNsKey1, noNsVal1);
		await keyvRedis.set(noNsKey2, noNsVal2);
		await keyvRedis.clear();
		keyvRedis.namespace = "ns1";
		const value = await keyvRedis.get(nsKey);
		expect(value).toBe(nsVal);
		await keyvRedis.disconnect();
	});

	test("should not clear all with no namespace if noNamespaceAffectsAll is false", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.noNamespaceAffectsAll = false;

		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		keyvRedis.namespace = "ns1";
		await keyvRedis.set(nsKey, nsVal);
		keyvRedis.namespace = undefined;
		await keyvRedis.set(noNsKey1, noNsVal1);
		await keyvRedis.set(noNsKey2, noNsVal2);
		await keyvRedis.clear();
		keyvRedis.namespace = "ns1";
		const value = await keyvRedis.get(nsKey);
		expect(value).toBeDefined();
	});

	test("should clear all with no namespace if noNamespaceAffectsAll is true", async () => {
		const keyvRedis = new KeyvRedis();
		keyvRedis.noNamespaceAffectsAll = true;

		const nsKey = faker.string.uuid();
		const nsVal = faker.lorem.word();
		const noNsKey1 = faker.string.uuid();
		const noNsKey2 = faker.string.uuid();
		const noNsVal1 = faker.lorem.word();
		const noNsVal2 = faker.lorem.word();
		keyvRedis.namespace = "ns1";
		await keyvRedis.set(nsKey, nsVal);
		keyvRedis.namespace = undefined;
		await keyvRedis.set(noNsKey1, noNsVal1);
		await keyvRedis.set(noNsKey2, noNsVal2);
		await keyvRedis.clear();
		keyvRedis.namespace = "ns1";
		const value = await keyvRedis.get(nsKey);
		expect(value).toBeUndefined();
	});

	test("should clear namespace but not other ones", async () => {
		const keyvRedis = new KeyvRedis();
		const client = (await keyvRedis.getClient()) as RedisClientType;
		await client.flushDb();
		const ns1Key = faker.string.uuid();
		const ns1Val = faker.lorem.word();
		const ns2Key = faker.string.uuid();
		const ns2Val = faker.lorem.word();
		keyvRedis.namespace = "ns1";
		await keyvRedis.set(ns1Key, ns1Val);
		keyvRedis.namespace = "ns2";
		await keyvRedis.set(ns2Key, ns2Val);
		await keyvRedis.clear();
		keyvRedis.namespace = "ns1";
		const value = await keyvRedis.get(ns1Key);
		expect(value).toBe(ns1Val);
		await keyvRedis.disconnect();
	});

	test("should be able to set many keys with namespace", async () => {
		const keyvRedis = new KeyvRedis("redis://localhost:6379", {
			namespace: "ns-many1",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyvRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		const value = await keyvRedis.get(key1);
		expect(value).toBe(val1);
		const value2 = await keyvRedis.get(key2);
		expect(value2).toBe(val2);
		await delay(10);
		const value3 = await keyvRedis.get(key3);
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});

	test("should be able to has many keys with namespace", async () => {
		const keyvRedis = new KeyvRedis("redis://localhost:6379", {
			namespace: "ns-many2",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyvRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		await delay(10);
		const exists = await keyvRedis.hasMany([key1, key2, key3]);
		expect(exists).toEqual([true, true, false]);
		await keyvRedis.disconnect();
	});

	test("should be able to delete many with namespace", async () => {
		const keyvRedis = new KeyvRedis("redis://localhost:6379", {
			namespace: "ns-dm1",
		});
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const key3 = faker.string.uuid();
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		const val3 = faker.lorem.word();
		await keyvRedis.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3, ttl: 5 },
		]);
		await keyvRedis.deleteMany([key2, key3]);
		await delay(10);
		const value = await keyvRedis.get(key1);
		expect(value).toBe(val1);
		const value2 = await keyvRedis.get(key2);
		expect(value2).toBeUndefined();
		const value3 = await keyvRedis.get(key3);
		expect(value3).toBeUndefined();
		await keyvRedis.disconnect();
	});
});
