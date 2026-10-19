import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hashName } from "../src/codec.js";
import KeyvFs from "../src/index.js";
import { fsOps } from "../src/io.js";
import type { Strategy } from "../src/strategies/strategy.js";
import { errno, freshLocation, strategies, tempDir, tick } from "./helpers.js";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function backendOf(store: KeyvFs): Strategy {
	return (store as unknown as { _backend: Strategy })._backend;
}

function entryFile(root: string, key: string, ns?: string): string {
	const hash = hashName(key);
	const namespace = ns === undefined ? "_" : `n-${hashName(ns)}`;
	return path.join(root, "data", namespace, hash.slice(0, 2), `${hash}.kv`);
}

describe.each(strategies)("%s strategy", (strategy) => {
	test("an expiry that has already passed deletes the key and is never stored", async () => {
		const location = freshLocation(strategy);
		const store = new KeyvFs({ path: location, strategy });
		expect(await store.set("missing", "v", Date.now() - 1)).toBe(true);
		await store.set("live", "v");
		expect(await store.set("live", "v", Date.now() - 1)).toBe(true);
		expect(await store.get("live")).toBeUndefined();
		expect(await store.has("missing")).toBe(false);
		await store.disconnect();

		const reopened = new KeyvFs({ path: location, strategy });
		expect(await reopened.getMany(["missing", "live"])).toEqual([undefined, undefined]);
		await reopened.disconnect();
	});

	test("a non-finite expiry means no expiry", async () => {
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.set("nan", "v", Number.NaN);
		await store.set("inf", "v", Number.POSITIVE_INFINITY);
		expect(await store.getMany(["nan", "inf"])).toEqual(["v", "v"]);
		await store.disconnect();
	});

	test("an expiry equal to now has passed", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.set("k", "v", 1_000_001);
		expect(await store.get("k")).toBe("v");
		vi.setSystemTime(1_000_001);
		expect(await store.get("k")).toBeUndefined();
		expect(await store.has("k")).toBe(false);
		expect(await store.delete("k")).toBe(false);
		await store.disconnect();
	});

	test("expired entries are hidden from every read", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const store = new KeyvFs({ path: freshLocation(strategy), strategy });
		await store.setMany([
			{ key: "short", value: "1", expires: 1_000_010 },
			{ key: "long", value: "2", expires: 2_000_000 },
		]);
		vi.setSystemTime(1_000_020);
		expect(await store.getMany(["short", "long"])).toEqual([undefined, "2"]);
		expect(await store.hasMany(["short", "long"])).toEqual([false, true]);
		const keys: unknown[] = [];
		for await (const [key] of store.iterator()) {
			keys.push(key);
		}

		expect(keys).toEqual(["long"]);
		expect(await store.deleteMany(["short", "long"])).toEqual([false, true]);
		await store.disconnect();
	});

	test("a sweep runs after a write once expiredCheckDelay has passed, but not right after load", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const store = new KeyvFs({ path: freshLocation(strategy), strategy, expiredCheckDelay: 1000 });
		const sweep = vi.spyOn(backendOf(store), "clearExpired");
		await store.set("a", "v");
		expect(sweep).not.toHaveBeenCalled();
		vi.setSystemTime(1_000_500);
		await store.set("b", "v");
		expect(sweep).not.toHaveBeenCalled();
		vi.setSystemTime(1_001_001);
		await store.set("c", "v");
		expect(sweep).toHaveBeenCalledTimes(1);
		await store.setMany([{ key: "d", value: "v" }]);
		expect(sweep).toHaveBeenCalledTimes(1);
		await store.disconnect();
	});

	test("a failed sweep is reported to listeners and never thrown", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const store = new KeyvFs({ path: freshLocation(strategy), strategy, expiredCheckDelay: 10 });
		await store.set("a", "v");
		const backend = backendOf(store);
		vi.spyOn(backend, "clearExpired").mockRejectedValue(new Error("sweep failed"));
		const errors: unknown[] = [];
		store.on("error", (error) => errors.push(error));
		vi.setSystemTime(1_000_100);
		await store.set("b", "v");
		await tick();
		expect(errors).toEqual([new Error("sweep failed")]);

		// With a listener that throws, as Keyv's forwarder does when Keyv has none, the error is
		// dropped instead of becoming an unhandled rejection.
		store.removeAllListeners("error");
		store.on("error", () => {
			throw new Error("listener threw");
		});
		vi.setSystemTime(1_000_200);
		await store.set("c", "v");
		await tick();
		await store.disconnect();
	});
});

describe("file strategy", () => {
	test("clearExpired drops expired entries, and the next save leaves them out", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const location = freshLocation("file");
		const store = new KeyvFs(location);
		await store.set("short", "v", 1_000_010);
		store.namespace = "ns";
		await store.set("short", "v", 1_000_010);
		vi.setSystemTime(1_000_020);
		await store.clearExpired();
		await store.set("other", "v");
		await store.disconnect();
		const { readFileSync } = await import("node:fs");
		expect(readFileSync(location, "utf8")).not.toContain("short");
	});
});

describe("directory strategy", () => {
	test("clearExpired and the sweep remove expired files in every namespace (keyv-file B4)", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_000_000);
		const root = path.join(tempDir(), "store");
		const store = new KeyvFs({ path: root, strategy: "directory" });
		await store.set("plain", "v", 1_000_010);
		await store.set("forever", "v");
		store.namespace = "ns";
		await store.set("namespaced", "v", 1_000_010);
		expect(existsSync(entryFile(root, "plain"))).toBe(true);
		expect(existsSync(entryFile(root, "namespaced", "ns"))).toBe(true);

		vi.setSystemTime(1_000_020);
		await store.clearExpired();
		expect(existsSync(entryFile(root, "plain"))).toBe(false);
		expect(existsSync(entryFile(root, "namespaced", "ns"))).toBe(false);
		expect(existsSync(entryFile(root, "forever"))).toBe(true);
		await store.disconnect();
	});

	test("the sweep skips foreign and damaged files", async () => {
		const root = path.join(tempDir(), "store");
		const store = new KeyvFs({ path: root, strategy: "directory" });
		await store.set("k", "v");
		const { mkdirSync, writeFileSync } = await import("node:fs");
		writeFileSync(path.join(root, "data", ".DS_Store"), "x");
		mkdirSync(path.join(root, "data", "_", "zz"));
		writeFileSync(path.join(root, "data", "_", "notes.txt"), "x");
		const file = entryFile(root, "damaged");
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, "not a header\n");
		await store.clearExpired();
		expect(existsSync(file)).toBe(true);
		expect(readdirSync(path.join(root, "data")).sort()).toEqual([".DS_Store", "_"]);
		await store.disconnect();
	});

	test("clearExpired rejects when the directory can't be read", async () => {
		const root = path.join(tempDir(), "store");
		const store = new KeyvFs({ path: root, strategy: "directory" });
		await store.set("k", "v");
		vi.spyOn(fsOps, "readdir").mockRejectedValue(errno("EIO"));
		await expect(store.clearExpired()).rejects.toThrow("EIO");
		vi.restoreAllMocks();
		await store.disconnect();
	});
});
