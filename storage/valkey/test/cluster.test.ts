import { faker } from "@faker-js/faker";
import Redis, { type Cluster } from "iovalkey";
import { describe, expect, test } from "vitest";
import KeyvValkey from "../src/index.js";

const clusterNodes = [
	{ host: "127.0.0.1", port: 7001 },
	{ host: "127.0.0.1", port: 7002 },
	{ host: "127.0.0.1", port: 7003 },
];

async function createReadyCluster(): Promise<Cluster> {
	const cluster = new Redis.Cluster(clusterNodes);
	await new Promise<void>((resolve) => {
		cluster.once("ready", resolve);
	});
	return cluster;
}

describe("cluster", () => {
	test("should setMany without CROSSSLOT errors", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkey(cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const key4 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);
		const val4 = faker.string.alphanumeric(10);

		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
			{ key: key4, value: val4 },
		]);

		expect(await store.getMany([key1, key2, key3, key4])).toEqual([val1, val2, val3, val4]);

		await store.disconnect();
	});

	test("should getMany without CROSSSLOT errors", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkey(cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);

		await store.set(key1, val1);
		await store.set(key2, val2);
		await store.set(key3, val3);

		const values = await store.getMany([key1, key2, key3]);
		expect(values).toEqual([val1, val2, val3]);
		expect(values.every((value) => value !== null)).toBe(true);

		await store.disconnect();
	});

	test("should deleteMany without CROSSSLOT errors", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkey(cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);

		await store.set(key1, val1);
		await store.set(key2, val2);
		await store.set(key3, val3);

		expect(await store.deleteMany([key1, key2, key3])).toEqual([true, true, true]);
		expect(await store.get(key1)).toBeUndefined();
		expect(await store.get(key2)).toBeUndefined();
		expect(await store.get(key3)).toBeUndefined();

		await store.disconnect();
	});

	test("should hasMany without CROSSSLOT errors", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkey(cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);

		await store.set(key1, val1);
		await store.set(key2, val2);

		expect(await store.hasMany([key1, key2, key3])).toEqual([true, true, false]);

		await store.disconnect();
	});
});
