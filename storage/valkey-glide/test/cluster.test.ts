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
});
