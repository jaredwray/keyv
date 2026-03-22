import { faker } from "@faker-js/faker";
import Redis, { type Cluster } from "iovalkey";
import * as test from "vitest";
import KeyvValkey from "../src/index.js";

const clusterNodes = [
	{ host: "127.0.0.1", port: 7001 },
	{ host: "127.0.0.1", port: 7002 },
	{ host: "127.0.0.1", port: 7003 },
];

async function createReadyCluster() {
	const cluster = new Redis.Cluster(clusterNodes);
	await new Promise<void>((resolve) => {
		cluster.once("ready", resolve);
	});
	return cluster;
}

test.it(
	"cluster: setMany should work without CROSSSLOT errors",
	{ retry: 3 },
	async (t) => {
		const cluster = await createReadyCluster();
		const keyv = new KeyvValkey(cluster as Cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const key4 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);
		const val4 = faker.string.alphanumeric(10);

		await keyv.setMany([
			{ key: key1, value: val1 },
			{ key: key2, value: val2 },
			{ key: key3, value: val3 },
			{ key: key4, value: val4 },
		]);

		const results = await keyv.getMany([key1, key2, key3, key4]);
		t.expect(results).toEqual([val1, val2, val3, val4]);

		await keyv.disconnect();
	},
);

test.it("cluster: getMany should work without CROSSSLOT errors", async (t) => {
	const cluster = await createReadyCluster();
	const keyv = new KeyvValkey(cluster as Cluster);

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);
	const val3 = faker.string.alphanumeric(10);

	await keyv.set(key1, val1);
	await keyv.set(key2, val2);
	await keyv.set(key3, val3);

	const values = await keyv.getMany([key1, key2, key3]);
	t.expect(values).toEqual([val1, val2, val3]);

	await keyv.disconnect();
});

test.it(
	"cluster: deleteMany should work without CROSSSLOT errors",
	async (t) => {
		const cluster = await createReadyCluster();
		const keyv = new KeyvValkey(cluster as Cluster);

		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const key3 = faker.string.alphanumeric(10);
		const val1 = faker.string.alphanumeric(10);
		const val2 = faker.string.alphanumeric(10);
		const val3 = faker.string.alphanumeric(10);

		await keyv.set(key1, val1);
		await keyv.set(key2, val2);
		await keyv.set(key3, val3);

		const result = await keyv.deleteMany([key1, key2, key3]);
		t.expect(result).toBe(true);
		t.expect(await keyv.get(key1)).toBe(undefined);
		t.expect(await keyv.get(key2)).toBe(undefined);
		t.expect(await keyv.get(key3)).toBe(undefined);

		await keyv.disconnect();
	},
);

test.it("cluster: hasMany should work without CROSSSLOT errors", async (t) => {
	const cluster = await createReadyCluster();
	const keyv = new KeyvValkey(cluster as Cluster);

	const key1 = faker.string.alphanumeric(10);
	const key2 = faker.string.alphanumeric(10);
	const key3 = faker.string.alphanumeric(10);
	const val1 = faker.string.alphanumeric(10);
	const val2 = faker.string.alphanumeric(10);

	await keyv.set(key1, val1);
	await keyv.set(key2, val2);

	const results = await keyv.hasMany([key1, key2, key3]);
	t.expect(results).toEqual([true, true, false]);

	await keyv.disconnect();
});
