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

	test("should clear the namespace's keys on every master", { retry: 3 }, async () => {
		const store = new KeyvValkey(await createReadyCluster(), {
			namespace: faker.string.alphanumeric(10),
		});
		const other = new KeyvValkey(await createReadyCluster(), {
			namespace: faker.string.alphanumeric(10),
		});
		const keys = Array.from({ length: 12 }, () => faker.string.alphanumeric(10));
		await store.setMany(keys.map((key) => ({ key, value: key })));
		await other.set(keys[0], "other");

		await store.clear();

		expect(await store.getMany(keys)).toEqual(keys.map(() => undefined));
		expect(await other.get(keys[0])).toBe("other");
		await other.clear();
		await store.disconnect();
		await other.disconnect();
	});

	test("should iterate the namespace's keys on every master", { retry: 3 }, async () => {
		const store = new KeyvValkey(await createReadyCluster(), {
			namespace: faker.string.alphanumeric(10),
		});
		const keys = Array.from({ length: 12 }, () => faker.string.alphanumeric(10));
		await store.setMany(keys.map((key) => ({ key, value: `value-${key}` })));

		const entries = new Map<string, unknown>();
		for await (const [key, value] of store.iterator()) {
			entries.set(key, value);
		}

		expect(entries).toEqual(new Map(keys.map((key) => [key, `value-${key}`])));
		await store.clear();
		await store.disconnect();
	});

	test("should track keys with useSets without CROSSSLOT errors", { retry: 3 }, async () => {
		const store = new KeyvValkey(await createReadyCluster(), {
			namespace: faker.string.alphanumeric(10),
			useSets: true,
		});
		const errors: unknown[] = [];
		store.on("error", (error: unknown) => errors.push(error));
		const keys = Array.from({ length: 12 }, () => faker.string.alphanumeric(10));

		expect(await store.set(keys[0], "value")).toBe(true);
		expect(await store.setMany(keys.slice(1).map((key) => ({ key, value: key })))).toEqual(
			keys.slice(1).map(() => true),
		);
		expect(await store.delete(keys[0])).toBe(true);
		expect(await store.get(keys[0])).toBeUndefined();

		await store.clear();
		expect(await store.getMany(keys)).toEqual(keys.map(() => undefined));
		expect(errors).toEqual([]);
		await store.disconnect();
	});
});
