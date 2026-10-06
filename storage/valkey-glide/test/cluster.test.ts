import { faker } from "@faker-js/faker";
import { GlideClusterClient } from "@valkey/valkey-glide";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

const clusterAddresses = [
	{ host: "127.0.0.1", port: 7201 },
	{ host: "127.0.0.1", port: 7202 },
	{ host: "127.0.0.1", port: 7203 },
];

async function createReadyCluster(): Promise<GlideClusterClient> {
	return GlideClusterClient.createClient({ addresses: clusterAddresses });
}

/**
 * Runs `operation` once, just before the cluster sends the next `command` or just after that
 * command completes, to land it between the steps of the method under test.
 */
function interleave(
	cluster: GlideClusterClient,
	when: "before" | "after",
	command: "sadd" | "set" | "srem",
	operation: () => Promise<unknown>,
): void {
	const send = cluster[command].bind(cluster) as (...args: unknown[]) => Promise<unknown>;
	vi.spyOn(cluster, command).mockImplementationOnce((async (...args: unknown[]) => {
		if (when === "before") {
			await operation();
			return send(...args);
		}

		const result = await send(...args);
		await operation();
		return result;
	}) as never);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("cluster", () => {
	test("should setMany and getMany across slots", async () => {
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

	test("should deleteMany and hasMany across slots", async () => {
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

	test("should connect via the {cluster: true, addresses} constructor path", async () => {
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

	test("should batch setMany/deleteMany/hasMany with useSets across cluster slots", async () => {
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
		const missingKey = faker.string.alphanumeric(10);
		expect(await store.deleteMany([...toDelete.map((entry) => entry.key), missingKey])).toEqual([
			...toDelete.map(() => true),
			false,
		]);
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

	test("should support useSets across cluster slots without a CROSSSLOT error", async () => {
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

	test("should iterate and clear a namespace across the cluster", async () => {
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

	test("should clear a namespace that spans several SCAN pages on each primary", async () => {
		const store = new KeyvValkeyGlide(await createReadyCluster(), {
			namespace: faker.string.alphanumeric(8),
		});
		// SCAN returns about 10 keys per call, so 90 keys over three primaries take several pages.
		const keys = Array.from({ length: 90 }, () => faker.string.alphanumeric(12));
		await store.setMany(keys.map((key) => ({ key, value: faker.string.alphanumeric(10) })));
		await store.clear();
		expect(await store.hasMany(keys)).toEqual(keys.map(() => false));
		await store.disconnect();
	});

	test("should send clear()'s reads to primaries rather than follow readFrom", async () => {
		const cluster = await createReadyCluster();
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(cluster, { namespace });
		await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
		const customCommand = vi.spyOn(cluster, "customCommand");
		const scan = vi.spyOn(cluster, "scan");
		const smembers = vi.spyOn(cluster, "smembers");

		await store.clear();
		expect(customCommand).toHaveBeenCalledWith(
			["SCAN", "0", "MATCH", `namespace:${namespace}::*`],
			{
				route: "allPrimaries",
			},
		);

		store.useSets = true;
		await store.set(faker.string.alphanumeric(10), faker.string.alphanumeric(10));
		await store.clear();
		expect(customCommand).toHaveBeenCalledWith(["SMEMBERS", `sets:${namespace}`], {
			route: { type: "primarySlotKey", key: `sets:${namespace}` },
		});
		expect(scan).not.toHaveBeenCalled();
		expect(smembers).not.toHaveBeenCalled();
		await store.disconnect();
	});

	test("should clear the namespace's keys on every primary and leave other namespaces", async () => {
		const store = new KeyvValkeyGlide(await createReadyCluster(), {
			namespace: faker.string.alphanumeric(10),
		});
		const other = new KeyvValkeyGlide(await createReadyCluster(), {
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

	test("should clear when a multi-node reply comes back keyed by address", async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster, { namespace: faker.string.alphanumeric(10) });
		const keys = Array.from({ length: 12 }, () => faker.string.alphanumeric(10));
		await store.setMany(keys.map((key) => ({ key, value: key })));

		// GLIDE declares multi-node replies as an object keyed by address; 2.5 returns records.
		const customCommand = cluster.customCommand.bind(cluster);
		vi.spyOn(cluster, "customCommand").mockImplementationOnce((async (
			...args: Parameters<typeof customCommand>
		) => {
			const records = (await customCommand(...args)) as unknown as Array<{
				key: string;
				value: unknown;
			}>;
			return Object.fromEntries(records.map(({ key, value }) => [key, value]));
		}) as never);
		await store.clear();

		expect(await store.getMany(keys)).toEqual(keys.map(() => undefined));
		await store.disconnect();
	});

	test("should keep a key tracked when clear() runs during set() with useSets", async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster, {
			namespace: faker.string.alphanumeric(10),
			useSets: true,
		});
		const key = faker.string.alphanumeric(10);

		interleave(cluster, "before", "set", async () => store.clear());
		expect(await store.set(key, "value")).toBe(true);

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should keep keys tracked when clear() runs during setMany() with useSets", async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster, {
			namespace: faker.string.alphanumeric(10),
			useSets: true,
		});
		const keys = Array.from({ length: 4 }, () => faker.string.alphanumeric(10));

		interleave(cluster, "after", "sadd", async () => store.clear());
		expect(await store.setMany(keys.map((key) => ({ key, value: key })))).toEqual(
			keys.map(() => true),
		);
		// The keys are tracked before and after the writes, so clear() landed between them.
		expect(vi.mocked(cluster.sadd)).toHaveBeenCalledTimes(2);

		await store.clear();
		expect(await store.getMany(keys)).toEqual(keys.map(() => undefined));
		await store.disconnect();
	});

	test("should keep tracking in step when set() runs during delete() with useSets", async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster, {
			namespace: faker.string.alphanumeric(10),
			useSets: true,
		});
		const key = faker.string.alphanumeric(10);
		await store.set(key, "first");

		interleave(cluster, "before", "srem", async () => store.set(key, "second"));
		expect(await store.delete(key)).toBe(true);
		expect(vi.mocked(cluster.srem)).toHaveBeenCalledTimes(1);

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should keep tracking in step when set() runs during clear() with useSets", async () => {
		const cluster = await createReadyCluster();
		const store = new KeyvValkeyGlide(cluster, {
			namespace: faker.string.alphanumeric(10),
			useSets: true,
		});
		const key = faker.string.alphanumeric(10);
		await store.set(key, "first");

		interleave(cluster, "before", "srem", async () => store.set(key, "second"));
		await store.clear();

		await store.clear();
		expect(await store.get(key)).toBeUndefined();
		await store.disconnect();
	});

	test("should yield nothing when iterating an empty cluster namespace", async () => {
		const cluster = await createReadyCluster();
		const namespace = faker.string.alphanumeric(8);
		const store = new KeyvValkeyGlide(cluster, { namespace });
		await store.clear();

		const first = await store.iterator().next();
		expect(first.value).toBeUndefined();

		await store.disconnect();
	});
});
