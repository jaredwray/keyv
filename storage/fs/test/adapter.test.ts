import { existsSync } from "node:fs";
import path from "node:path";
import Keyv from "keyv";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvFs from "../src/index.js";
import { fsOps } from "../src/io.js";
import { errno, freshLocation, strategies, tempDir } from "./helpers.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe.each(strategies)("%s strategy", (strategy) => {
	test("set, get, has, delete and the batch methods", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		expect(await store.set("a", "1")).toBe(true);
		expect(
			await store.setMany([
				{ key: "b", value: "2" },
				{ key: "c", value: "3" },
			]),
		).toEqual([true, true]);
		expect(await store.setMany([])).toEqual([]);
		expect(await store.get("a")).toBe("1");
		expect(await store.getMany(["a", "missing", "c"])).toEqual(["1", undefined, "3"]);
		expect(await store.has("b")).toBe(true);
		expect(await store.hasMany(["b", "missing"])).toEqual([true, false]);
		expect(await store.delete("a")).toBe(true);
		expect(await store.delete("a")).toBe(false);
		expect(await store.deleteMany(["missing", "b", "c"])).toEqual([false, true, true]);
		expect(await store.getMany(["b", "c"])).toEqual([undefined, undefined]);
		await store.disconnect();
	});

	test("data survives closing and reopening", async () => {
		const location = freshLocation(strategy);
		const first = new KeyvFs({ path: location, strategy });
		await first.set("kept", "yes");
		first.namespace = "ns";
		await first.set("kept", "in ns");
		await first.disconnect();

		const second = new KeyvFs({ path: location, strategy });
		expect(await second.get("kept")).toBe("yes");
		second.namespace = "ns";
		expect(await second.get("kept")).toBe("in ns");
		await second.disconnect();
	});

	test("writes apply in call order, including a clear between them", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.set("before", "old");
		const results = await Promise.all([
			store.set("before", "v"),
			store.clear(),
			store.set("after", "v"),
		]);
		expect(results).toEqual([true, undefined, true]);
		expect(await store.get("before")).toBeUndefined();
		expect(await store.get("after")).toBe("v");
		await store.disconnect();
	});

	test("deleting entries while iterating", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.setMany([
			{ key: "a", value: "1" },
			{ key: "b", value: "2" },
			{ key: "c", value: "3" },
		]);
		const seen: string[] = [];
		for await (const [key] of store.iterator()) {
			seen.push(key as string);
			await store.deleteMany(["a", "b", "c"].filter((other) => other !== key));
		}

		expect(seen).toHaveLength(1);
		await store.disconnect();
	});

	test("Keyv.iterator deletes expired entries as it goes", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		const keyv = new Keyv({ store, namespace: "it" });
		await keyv.set("old", "x", 20);
		await keyv.set("live", "y");
		await new Promise((resolve) => setTimeout(resolve, 40));
		const entries: Array<[string, unknown]> = [];
		for await (const entry of keyv.iterator()) {
			entries.push(entry);
		}

		expect(entries).toEqual([["live", "y"]]);
		expect(await keyv.has("old")).toBe(false);
		await keyv.disconnect();
	});

	test("expiry is enforced by the adapter when Keyv's checkExpired is off", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		const keyv = new Keyv({ store, checkExpired: false });
		await keyv.set("short", "x", 20);
		expect(await keyv.get("short")).toBe("x");
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(await keyv.get("short")).toBeUndefined();
		expect(await keyv.has("short")).toBe(false);
		await keyv.disconnect();
	});

	test("disconnect and flush do nothing to a store that was never used", async () => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy });
		await store.flush();
		await store.clearExpired();
		await store.disconnect();
		await store.disconnect();
		expect(existsSync(location)).toBe(false);
	});

	test("every method rejects after disconnect", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.set("k", "v");
		await store.disconnect();
		const calls: Array<() => Promise<unknown>> = [
			() => store.get("k"),
			() => store.getMany(["k"]),
			() => store.set("k", "v"),
			() => store.setMany([{ key: "k", value: "v" }]),
			() => store.delete("k"),
			() => store.deleteMany(["k"]),
			() => store.has("k"),
			() => store.hasMany(["k"]),
			() => store.clear(),
			() => store.flush(),
			() => store.clearExpired(),
			() => store.iterator().next(),
		];
		for (const call of calls) {
			await expect(call()).rejects.toThrow(/disconnected/);
		}
	});

	test("a value that can't be stored rejects without changing anything", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.set("k", "kept");
		await expect(
			store.setMany([
				{ key: "k", value: "replaced" },
				{ key: "fn", value: () => 1 },
			]),
		).rejects.toThrow(TypeError);
		expect(await store.get("k")).toBe("kept");
		await store.set("other", "fine");
		expect(await store.get("other")).toBe("fine");
		await store.disconnect();
	});
});

describe("file strategy", () => {
	test("disconnect saves pending writes", async () => {
		const location = freshLocation("file");
		const store = new KeyvFs({ path: location, writeDelay: 60_000 });
		const pending = store.set("k", "v");
		await store.disconnect();
		await pending;
		const reopened = new KeyvFs({ path: location, writeDelay: 60_000 });
		expect(await reopened.get("k")).toBe("v");
		await reopened.disconnect();
	});

	test("a failed final save still releases the store, then rejects", async () => {
		const location = freshLocation("file");
		const store = new KeyvFs({ path: location, writeDelay: 60_000 });
		await store.get("load");
		const pending = store.set("k", "v").catch((error: unknown) => error);
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
		await expect(store.disconnect()).rejects.toThrow("EIO");
		expect(await pending).toMatchObject({ code: "EIO" });
		rename.mockRestore();

		const reopened = new KeyvFs({ path: location, writeDelay: 5 });
		expect(await reopened.get("k")).toBeUndefined();
		await reopened.disconnect();
	});

	test("errors from Keyv's error listener are reported once per operation", async () => {
		const location = freshLocation("file");
		const store = new KeyvFs(location);
		const keyv = new Keyv({ store });
		const errors: unknown[] = [];
		keyv.on("error", (error) => errors.push(error));
		vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
		expect(await keyv.set("k", "v")).toBe(false);
		expect(errors).toHaveLength(1);
		vi.restoreAllMocks();
		await keyv.disconnect();
	});
});

describe("directory strategy", () => {
	test("flush resolves at once", async () => {
		const store = new KeyvFs({ path: path.join(tempDir(), "store"), strategy: "directory" });
		await store.set("k", "v");
		await store.flush();
		await store.disconnect();
	});
});

describe("closing", () => {
	test("disconnect rejects when closing the store fails after a clean flush", async () => {
		const store = new KeyvFs(freshLocation("file"));
		await store.set("k", "v");
		const backend = (store as unknown as { _backend: { close: () => Promise<void> } })._backend;
		vi.spyOn(backend, "close").mockRejectedValue(new Error("close failed"));
		await expect(store.disconnect()).rejects.toThrow("close failed");
	});

	test("a disconnect during a load that fails still closes cleanly", async () => {
		const location = freshLocation("file");
		const { writeFileSync } = await import("node:fs");
		writeFileSync(location, "not a store\n");
		const store = new KeyvFs(location);
		const read = store.get("k");
		await store.disconnect();
		await expect(read).rejects.toThrow(/not a @keyv\/fs store file/);
	});
});

describe("flush and disconnect cover operations already called", () => {
	test.each(strategies)("%s: a write called just before disconnect is saved", async (strategy) => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy, writeDelay: 60_000 });
		const other = new KeyvFs({ path: location, strategy, writeDelay: 60_000 });
		const write = store.set("k", "v");
		await store.disconnect();
		expect(await write).toBe(true);
		await other.disconnect();

		const reopened = new KeyvFs({ path: location, strategy });
		expect(await reopened.get("k")).toBe("v");
		await reopened.disconnect();
	});

	test.each(strategies)("%s: flush covers writes called before it", async (strategy) => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy, writeDelay: 60_000 });
		const write = store.set("k", "v");
		await store.flush();
		expect(await write).toBe(true);
		const { existsSync: exists } = await import("node:fs");
		expect(exists(location)).toBe(true);
		await store.disconnect();
	});

	test("flush rejects when the save fails", async () => {
		const store = new KeyvFs(freshLocation("file"), { writeDelay: 60_000 });
		await store.get("load");
		const write = store.set("k", "v").catch((error: unknown) => error);
		vi.spyOn(fsOps, "rename").mockRejectedValueOnce(errno("EIO"));
		await expect(store.flush()).rejects.toThrow("EIO");
		expect(await write).toMatchObject({ code: "EIO" });
		await store.disconnect();
	});
});
