import process from "node:process";
import { faker } from "@faker-js/faker";
import { Decoder } from "@valkey/valkey-glide";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

async function collect(store: KeyvValkeyGlide): Promise<Array<[string, string | undefined]>> {
	const entries: Array<[string, string | undefined]> = [];
	for await (const entry of store.iterator<string>()) {
		entries.push(entry);
	}

	return entries;
}

describe.each([false, true])("tracked iterator (cluster: %s)", (cluster) => {
	const stores: KeyvValkeyGlide[] = [];
	const createStore = (namespace?: string) => {
		const store = new KeyvValkeyGlide(
			cluster
				? { cluster: true, addresses: [{ host: "127.0.0.1", port: 7201 }] }
				: (process.env.VALKEY_URI ?? "redis://localhost:6371"),
			{ namespace, useSets: true, defaultDecoder: Decoder.Bytes },
		);
		stores.push(store);
		return store;
	};

	afterEach(async () => {
		vi.restoreAllMocks();
		for (const store of stores.splice(0)) {
			try {
				await store.clear();
			} finally {
				await store.disconnect();
			}
		}
	});

	test("isolates nested namespaces and preserves colons in keys", async () => {
		const namespace = `${faker.string.alphanumeric(12)}*?[x]\\`;
		const parent = createStore(namespace);
		const child = createStore(`${namespace}:archive`);
		await parent.set("own:key", "parent");
		await child.set("child:key", "child");

		expect(await collect(parent)).toEqual([["own:key", "parent"]]);
		expect(await collect(child)).toEqual([["child:key", "child"]]);
	});

	test("isolates the default tracking set from namespaced stores", async () => {
		const root = createStore();
		await root.clear();
		const child = createStore(faker.string.alphanumeric(12));
		await root.set("root:key", "root");
		await child.set("child:key", "child");

		expect(await collect(root)).toEqual([["root:key", "root"]]);
		expect(await collect(child)).toEqual([["child:key", "child"]]);
	});

	test("skips expired and deleted members while retaining empty values", async () => {
		const store = createStore(faker.string.alphanumeric(12));
		await store.setMany([
			{ key: "expired", value: "old", expires: Date.now() - 1000 },
			{ key: "deleted", value: "removed" },
			{ key: "live", value: "" },
		]);
		await store.client.unlink([`sets:${store.namespace}:deleted`]);

		expect(await collect(store)).toEqual([["live", ""]]);
		expect(await store.client.scard(`sets:${store.namespace}`)).toBe(3);
	});

	test("does not iterate untracked keys even when their prefix matches", async () => {
		const store = createStore(faker.string.alphanumeric(12));
		const client = await store.getClient();
		const untrackedKey = `sets:${store.namespace}:untracked`;
		await client.set(untrackedKey, "outside tracking set");
		try {
			expect(await collect(store)).toEqual([]);
		} finally {
			await client.unlink([untrackedKey]);
		}
	});

	test("streams set pages lazily and continues past empty pages", async () => {
		const store = createStore(faker.string.alphanumeric(12));
		await store.setMany([
			{ key: "first", value: "one" },
			{ key: "last", value: "two" },
		]);
		const setKey = `sets:${store.namespace}`;
		const client = store.client;
		const scan = vi.spyOn(client, "scan");
		const smembers = vi.spyOn(client, "smembers");
		const sscan = vi
			.spyOn(client, "sscan")
			.mockResolvedValueOnce([Buffer.from("11"), [Buffer.from(`${setKey}:first`)]])
			.mockResolvedValueOnce([Buffer.from("22"), []])
			.mockResolvedValueOnce([Buffer.from("0"), [Buffer.from(`${setKey}:last`)]]);
		const mget = vi.spyOn(client, "mget");
		const iterator = store.iterator<string>();
		expect(sscan).not.toHaveBeenCalled();
		expect(await iterator.next()).toEqual({ value: ["first", "one"], done: false });
		expect(sscan).toHaveBeenCalledTimes(1);
		expect(mget).toHaveBeenCalledExactlyOnceWith([`${setKey}:first`]);
		expect(await iterator.next()).toEqual({ value: ["last", "two"], done: false });
		expect(await iterator.next()).toEqual({ value: undefined, done: true });
		expect(sscan.mock.calls).toEqual([
			[setKey, "0"],
			[setKey, "11"],
			[setKey, "22"],
		]);
		expect(mget).toHaveBeenCalledTimes(2);
		expect(scan).not.toHaveBeenCalled();
		expect(smembers).not.toHaveBeenCalled();
	});
});
