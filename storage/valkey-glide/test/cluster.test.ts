import net from "node:net";
import { faker } from "@faker-js/faker";
import { GlideClusterClient } from "@valkey/valkey-glide";
import { describe, expect, test } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const clusterAddresses = [
	{ host: "127.0.0.1", port: 7001 },
	{ host: "127.0.0.1", port: 7002 },
	{ host: "127.0.0.1", port: 7003 },
];

async function isPortOpen(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host: "127.0.0.1", port });
		socket.setTimeout(300);
		socket.on("connect", () => {
			socket.end();
			resolve(true);
		});
		socket.on("timeout", () => {
			socket.destroy();
			resolve(false);
		});
		socket.on("error", () => {
			resolve(false);
		});
	});
}

const clusterAvailable = await isPortOpen(7001);

async function createReadyCluster(): Promise<GlideClusterClient> {
	return GlideClusterClient.createClient({ addresses: clusterAddresses });
}

describe.skipIf(!clusterAvailable)("cluster", () => {
	test("should setMany and getMany across slots", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);

		await store.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
		]);

		expect(await store.getMany([key1, key2, key3])).toEqual([val1, val2, val3]);
		await store.disconnect();
	});

	test("should deleteMany and hasMany across slots", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		await store.set(key1, faker.string.alphanumeric(10));
		await store.set(key2, faker.string.alphanumeric(10));

		expect(await store.hasMany([key1, key2, key3])).toEqual([true, true, false]);
		expect(await store.deleteMany([key1, key2, key3])).toEqual([true, true, false]);
		await store.disconnect();
	});

	test("should connect via the {cluster: true, addresses} constructor path", {
		retry: 3,
	}, async () => {
		const store = new KeyvValkeyGlide({ cluster: true, addresses: clusterAddresses });
		const client = await store.getClient();
		expect(client).toBeInstanceOf(GlideClusterClient);

		const key = faker.string.alphanumeric(10);
		const value = faker.string.alphanumeric(10);
		await store.set(key, value);
		expect(await store.get(key)).toBe(value);
		await store.delete(key);
		await store.disconnect();
	});

	test("should batch setMany/deleteMany/hasMany with useSets across cluster slots", {
		retry: 3,
	}, async () => {
		const cluster = await createReadyCluster();
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(cluster, { useSets: true, namespace });

		const entries = Array.from({ length: 15 }, () => ({
			key: faker.string.alphanumeric(10),
			value: faker.string.alphanumeric(10),
		}));

		expect(await store.setMany(entries)).toEqual(entries.map(() => true));
		expect(await store.getMany(entries.map((entry) => entry.key))).toEqual(
			entries.map((entry) => entry.value),
		);

		const [toDelete, toKeep] = [entries.slice(0, 5), entries.slice(5)];
		expect(await store.deleteMany(toDelete.map((entry) => entry.key))).toEqual(
			toDelete.map(() => true),
		);
		expect(await store.hasMany([...toDelete, ...toKeep].map((entry) => entry.key))).toEqual([
			...toDelete.map(() => false),
			...toKeep.map(() => true),
		]);

		await store.clear();
		for (const entry of toKeep) {
			expect(await store.get(entry.key)).toBeUndefined();
		}

		await store.disconnect();
	});

	test("should support useSets across cluster slots without a CROSSSLOT error", {
		retry: 3,
	}, async () => {
		const cluster = await createReadyCluster();
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(cluster, { useSets: true, namespace });

		const entries = new Map<string, string>();
		for (let i = 0; i < 10; i++) {
			const key = faker.string.alphanumeric(10);
			const value = faker.string.alphanumeric(10);
			entries.set(key, value);
			await store.set(key, value);
		}

		for (const [key, value] of entries) {
			expect(await store.get(key)).toBe(value);
		}

		await store.clear();
		for (const key of entries.keys()) {
			expect(await store.get(key)).toBeUndefined();
		}

		await store.disconnect();
	});

	test("should iterate and clear a namespace across the cluster", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(cluster, { namespace });

		const entries = new Map<string, string>();
		for (let i = 0; i < 5; i++) {
			const key = faker.string.alphanumeric(10);
			const value = faker.string.alphanumeric(10);
			entries.set(key, value);
			await store.set(key, value);
		}

		const collected = new Map<string, string>();
		for await (const [key, value] of store.iterator<string>()) {
			collected.set(key, value as string);
		}

		expect(collected.size).toBe(entries.size);
		for (const [key, value] of entries) {
			expect(collected.get(key)).toBe(value);
		}

		await store.clear();
		for (const key of entries.keys()) {
			expect(await store.get(key)).toBeUndefined();
		}

		await store.disconnect();
	});

	test("should yield nothing when iterating an empty cluster namespace", { retry: 3 }, async () => {
		const cluster = await createReadyCluster();
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(cluster, { namespace });
		await store.clear();

		const first = await store.iterator().next();
		expect(first.value).toBeUndefined();

		await store.disconnect();
	});
});
