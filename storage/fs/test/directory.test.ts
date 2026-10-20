import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import Keyv from "keyv";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hashName } from "../src/codec.js";
import KeyvFs, { KeyvFsCorruptionError } from "../src/index.js";
import { fsOps } from "../src/io.js";
import { errno, skipAhead, tempDir, tick } from "./helpers.js";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function newStore(root = path.join(tempDir(), "store")): { root: string; store: KeyvFs } {
	return { root, store: new KeyvFs({ path: root, strategy: "directory" }) };
}

function entryFile(root: string, key: string, ns?: string): string {
	const hash = hashName(key);
	const namespace = ns === undefined ? "_" : `n-${hashName(ns)}`;
	return path.join(root, "data", namespace, hash.slice(0, 2), `${hash}.kv`);
}

function collectErrors(store: KeyvFs): unknown[] {
	const errors: unknown[] = [];
	store.on("error", (error) => errors.push(error));
	return errors;
}

/** Holds a promise-returning fs call for one path until `release` is called. */
function holdCall<K extends "readFile" | "open">(method: K, matches: (file: string) => boolean) {
	const original = fsOps[method] as (...args: unknown[]) => Promise<unknown>;
	let release!: () => void;
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let reached!: () => void;
	const reachedPromise = new Promise<void>((resolve) => {
		reached = resolve;
	});
	let held = false;
	vi.spyOn(fsOps, method).mockImplementation((async (...args: unknown[]) => {
		const result = await original(...args);
		if (!held && matches(String(args[0]))) {
			held = true;
			reached();
			await released;
		}

		return result;
	}) as never);
	return { release, reached: reachedPromise };
}

describe("directory strategy layout", () => {
	test("stores each key in a hashed file with a header line and the raw value", async () => {
		const { root, store } = newStore();
		await store.set("user:1", '{"value":"hello"}');
		store.namespace = "users";
		await store.set("b", '{"value":{"x":1}}', 4_102_444_800_000);
		await store.disconnect();

		expect(readFileSync(entryFile(root, "user:1"), "utf8")).toBe(
			'{"format":"keyv-fs","kind":"entry","version":1,"k":"user:1","t":"s"}\n{"value":"hello"}',
		);
		expect(readFileSync(entryFile(root, "b", "users"), "utf8")).toBe(
			'{"format":"keyv-fs","kind":"entry","version":1,"k":"b","n":"users","e":4102444800000,"t":"s"}\n{"value":{"x":1}}',
		);
		expect(readdirSync(root).sort()).toEqual(["data", "keyv-fs.json", "tmp", "trash"]);
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
	});

	test("clear moves only the current namespace to the trash, then removes it", async () => {
		const { root, store } = newStore();
		await store.set("plain", "v");
		store.namespace = "ns";
		await store.set("namespaced", "v");
		await store.clear();
		expect(existsSync(entryFile(root, "namespaced", "ns"))).toBe(false);
		expect(existsSync(entryFile(root, "plain"))).toBe(true);
		await store.disconnect();
		expect(readdirSync(path.join(root, "trash"))).toEqual([]);
	});

	test("a write after clear makes the namespace directory again", async () => {
		const { store } = newStore();
		await store.set("k", "1");
		await store.clear();
		await store.set("k", "2");
		expect(await store.get("k")).toBe("2");
		await store.disconnect();
	});

	test("load removes stale temporary files and leftover trash, but keeps fresh temporary files", async () => {
		const root = path.join(tempDir(), "store");
		const first = new KeyvFs({ path: root, strategy: "directory" });
		await first.set("k", "v");
		await first.disconnect();

		const stale = path.join(root, "tmp", "1-stale.tmp");
		const fresh = path.join(root, "tmp", "1-fresh.tmp");
		writeFileSync(stale, "x");
		writeFileSync(fresh, "x");
		const old = new Date(Date.now() - 60 * 60 * 1000);
		utimesSync(stale, old, old);
		mkdirSync(path.join(root, "trash", "n-left-over", "aa"), { recursive: true });

		const second = new KeyvFs({ path: root, strategy: "directory" });
		expect(await second.get("k")).toBe("v");
		await second.disconnect();
		expect(readdirSync(path.join(root, "tmp"))).toEqual(["1-fresh.tmp"]);
		expect(readdirSync(path.join(root, "trash"))).toEqual([]);
	});

	test("the iterator ignores files it did not write", async () => {
		const { root, store } = newStore();
		await store.set("k", "v");
		const shard = path.dirname(entryFile(root, "k"));
		writeFileSync(path.join(shard, ".DS_Store"), "x");
		writeFileSync(path.join(path.dirname(shard), "Thumbs.db"), "x");
		mkdirSync(path.join(path.dirname(shard), "not-a-shard"));
		const entries: unknown[] = [];
		for await (const entry of store.iterator()) {
			entries.push(entry);
		}

		expect(entries).toEqual([["k", "v"]]);
		await store.disconnect();
	});

	test("many keys at once stay within the open-file limit", async () => {
		const { store } = newStore();
		const keys = Array.from({ length: 2000 }, (_, index) => `key-${index}`);
		await store.setMany(keys.map((key) => ({ key, value: key })));
		expect(await store.getMany(keys)).toEqual(keys);
		expect(await store.hasMany(keys)).toEqual(keys.map(() => true));
		expect(await store.deleteMany(keys)).toEqual(keys.map(() => true));
		await store.disconnect();
	}, 30_000);
});

describe("directory strategy damaged entries", () => {
	test("a file under the wrong key is treated as missing and reported", async () => {
		const { root, store } = newStore();
		await store.set("a", "va");
		await store.set("b", "vb");
		copyFileSync(entryFile(root, "a"), entryFile(root, "b"));
		const errors = collectErrors(store);
		expect(await store.get("b")).toBeUndefined();
		expect(await store.has("b")).toBe(false);
		const entries: unknown[] = [];
		for await (const entry of store.iterator()) {
			entries.push(entry);
		}

		expect(entries).toEqual([["a", "va"]]);
		expect(errors).toHaveLength(3);
		expect(errors[0]).toBeInstanceOf(KeyvFsCorruptionError);
		expect((errors[0] as KeyvFsCorruptionError).path).toBe(entryFile(root, "b"));

		await store.set("b", "fixed");
		expect(await store.get("b")).toBe("fixed");
		await store.disconnect();
	});

	test("a bad header or a bad value is treated as missing and reported", async () => {
		const { root, store } = newStore();
		await store.set("header", "v");
		await store.set("value", { value: 1 });
		await store.set("nonewline", "v");
		writeFileSync(entryFile(root, "header"), "garbage\nvalue");
		const valueFile = entryFile(root, "value");
		const text = readFileSync(valueFile, "utf8");
		writeFileSync(valueFile, `${text.slice(0, text.indexOf("\n"))}\n{broken`);
		writeFileSync(entryFile(root, "nonewline"), "no header line");
		const errors = collectErrors(store);
		expect(await store.getMany(["header", "value", "nonewline"])).toEqual([
			undefined,
			undefined,
			undefined,
		]);
		const entries: unknown[] = [];
		for await (const entry of store.iterator()) {
			entries.push(entry);
		}

		expect(entries).toEqual([]);
		expect(errors.length).toBe(6);
		expect(await store.delete("header")).toBe(false);
		expect(existsSync(entryFile(root, "header"))).toBe(false);
		await store.disconnect();
	});

	test("with no Keyv error listener, a damaged entry rejects that one operation", async () => {
		const { root, store } = newStore();
		const keyv = new Keyv({ store });
		await keyv.set("k", "v");
		writeFileSync(entryFile(root, "k"), "garbage\n");
		await expect(keyv.get("k")).rejects.toThrow(KeyvFsCorruptionError);
		await keyv.set("k", "v2");
		expect(await keyv.get("k")).toBe("v2");
		await keyv.disconnect();
	});

	test("an iterator reports damaged entries to the instance that iterates", async () => {
		const { root, store } = newStore();
		await store.set("a", "1");
		await store.set("b", "2");
		writeFileSync(entryFile(root, "b"), "garbage\n");
		const errors = collectErrors(store);
		const entries: unknown[] = [];
		for await (const entry of store.iterator()) {
			entries.push(entry);
		}

		expect(entries).toEqual([["a", "1"]]);
		expect(errors).toHaveLength(1);
		await store.disconnect();
	});
});

describe("directory strategy races and failures", () => {
	test("a write made while a read is removing an expired entry is kept", async () => {
		const { root, store } = newStore();
		await store.set("k", "old", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = store.get("k");
		await hold.reached;
		await store.set("k", "new");
		hold.release();
		expect(await read).toBeUndefined();
		expect(await store.get("k")).toBe("new");
		await store.disconnect();
	});

	test("a write made while the sweep is checking an expired entry is kept", async () => {
		const { root, store } = newStore();
		await store.set("k", "old", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("open", (target) => target === file);
		const sweep = store.clearExpired();
		await hold.reached;
		await store.set("k", "new");
		hold.release();
		await sweep;
		expect(await store.get("k")).toBe("new");
		await store.disconnect();
	});

	test("a delete and a write of one key apply in call order", async () => {
		const { store } = newStore();
		await store.set("k", "old");
		const [deleted] = await Promise.all([store.delete("k"), store.set("k", "new")]);
		expect(deleted).toBe(true);
		expect(await store.get("k")).toBe("new");
		const [written, deletedAgain] = await Promise.all([store.set("k", "newer"), store.delete("k")]);
		expect(written).toBe(true);
		expect(deletedAgain).toBe(true);
		expect(await store.get("k")).toBeUndefined();
		await store.disconnect();
	});

	test("a write called before clear is cleared, and one called after it is kept", async () => {
		const { store } = newStore();
		await store.set("seed", "v");
		await Promise.all([store.set("before", "v"), store.clear(), store.set("after", "v")]);
		expect(await store.getMany(["seed", "before", "after"])).toEqual([undefined, undefined, "v"]);
		await store.disconnect();
	});

	test("a failed rename removes the temporary file and rejects", async () => {
		const { root, store } = newStore();
		await store.get("load");
		vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
		await expect(store.set("k", "v")).rejects.toThrow("EIO");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		vi.restoreAllMocks();
		await store.disconnect();
	});

	test("writes recover when the temporary or shard directory disappears", async () => {
		const { root, store } = newStore();
		await store.set("k", "v1");
		rmSync(path.join(root, "tmp"), { recursive: true });
		rmSync(path.dirname(entryFile(root, "k")), { recursive: true });
		await store.set("k", "v2");
		expect(await store.get("k")).toBe("v2");
		await store.disconnect();
	});

	test("errors other than a missing directory reject the write", async () => {
		const { store } = newStore();
		await store.get("load");
		vi.spyOn(fsOps, "writeFile").mockRejectedValueOnce(errno("ENOSPC"));
		await expect(store.set("k", "v")).rejects.toThrow("ENOSPC");
		const rename = fsOps.rename;
		vi.spyOn(fsOps, "rename").mockRejectedValueOnce(errno("ENOENT")).mockImplementation(rename);
		await store.set("k", "v");
		expect(await store.get("k")).toBe("v");
		vi.spyOn(fsOps, "rename").mockRejectedValueOnce(errno("EIO"));
		await expect(store.clear()).rejects.toThrow("EIO");
		vi.restoreAllMocks();
		await store.disconnect();
	});

	test("read errors other than a missing file reject", async () => {
		const { store } = newStore();
		await store.set("k", "v");
		vi.spyOn(fsOps, "readFile").mockRejectedValueOnce(errno("EIO"));
		await expect(store.get("k")).rejects.toThrow("EIO");
		vi.restoreAllMocks();
		await store.disconnect();
	});

	test("expired entries are removed by reads, and a later read finds nothing", async () => {
		const { root, store } = newStore();
		await store.set("k", "v", Date.now() + 60_000);
		await store.set("h", "v", Date.now() + 60_000);
		skipAhead();
		expect(await store.get("k")).toBeUndefined();
		expect(await store.has("h")).toBe(false);
		expect(existsSync(entryFile(root, "k"))).toBe(false);
		expect(existsSync(entryFile(root, "h"))).toBe(false);
		await tick();
		await store.disconnect();
	});
});

describe("directory strategy best-effort cleanup", () => {
	test("cleanup failures at load are ignored", async () => {
		const root = path.join(tempDir(), "store");
		const first = new KeyvFs({ path: root, strategy: "directory" });
		await first.set("k", "v");
		await first.disconnect();
		writeFileSync(path.join(root, "tmp", "1-a.tmp"), "x");
		writeFileSync(path.join(root, "tmp", "1-b.tmp"), "x");
		const old = new Date(Date.now() - 60 * 60 * 1000);
		utimesSync(path.join(root, "tmp", "1-b.tmp"), old, old);
		mkdirSync(path.join(root, "trash", "n-left"));

		const stat = fsOps.stat;
		vi.spyOn(fsOps, "stat").mockImplementation((async (file: string) => {
			if (file.endsWith("1-a.tmp")) {
				throw errno("EACCES");
			}

			return stat(file);
		}) as never);
		vi.spyOn(fsOps, "unlink").mockRejectedValue(errno("EPERM"));
		vi.spyOn(fsOps, "rm").mockRejectedValue(errno("EBUSY"));
		const second = new KeyvFs({ path: root, strategy: "directory" });
		expect(await second.get("k")).toBe("v");
		await second.disconnect();
		vi.restoreAllMocks();
		expect(readdirSync(path.join(root, "tmp")).sort()).toEqual(["1-a.tmp", "1-b.tmp"]);
	});

	test("a failed write whose temporary file can't be removed still rejects with the cause", async () => {
		const { store } = newStore();
		await store.get("load");
		vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
		vi.spyOn(fsOps, "unlink").mockRejectedValue(errno("EPERM"));
		await expect(store.set("k", "v")).rejects.toThrow("EIO");
		vi.restoreAllMocks();
		await store.disconnect();
	});

	test("entries that vanish while being checked are skipped", async () => {
		const { root, store } = newStore();
		await store.set("k", "old", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = store.get("k");
		await hold.reached;
		rmSync(file);
		hold.release();
		expect(await read).toBeUndefined();

		const readdir = fsOps.readdir;
		vi.spyOn(fsOps, "readdir").mockImplementation((async (directory: string) => {
			const names = (await readdir(directory)) as string[];
			return directory === path.dirname(file) ? [...names, `${"0".repeat(64)}.kv`] : names;
		}) as never);
		await store.clearExpired();
		vi.restoreAllMocks();
		await store.disconnect();
	});
});

test("clear resolves even when the cleared namespace can't be removed from the trash", async () => {
	const { root, store } = newStore();
	await store.set("k", "v");
	vi.spyOn(fsOps, "rm").mockRejectedValue(errno("EBUSY"));
	await store.clear();
	expect(await store.get("k")).toBeUndefined();
	await store.disconnect();
	vi.restoreAllMocks();
	expect(readdirSync(path.join(root, "trash"))).toHaveLength(1);

	const reopened = new KeyvFs({ path: root, strategy: "directory" });
	await reopened.get("load");
	await reopened.disconnect();
	expect(readdirSync(path.join(root, "trash"))).toEqual([]);
});

describe("directory strategy across processes", () => {
	// Two backends on one directory stand in for two processes: they share no lock.
	async function twoProcesses() {
		const { DirectoryStrategy } = await import("../src/strategies/directory.js");
		const root = path.join(tempDir(), "store");
		const a = new DirectoryStrategy(root, 60_000);
		const b = new DirectoryStrategy(root, 60_000);
		await a.load();
		await b.load();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		return { root, a, b, file: entryFile(root, "k") };
	}

	/**
	 * Starts A's read of the expired key and holds it right after A's cleanup opened the entry to
	 * check it, so B can write in between A's check and A's delete.
	 */
	async function readHeldAtCheck(a: { get: (...args: never[]) => Promise<unknown> }, file: string) {
		const hold = holdCall("open", (target) => target === file);
		const reports: Error[] = [];
		const read = (a.get as (ns: undefined, key: string, reports: Error[]) => Promise<unknown>)(
			undefined,
			"k",
			reports,
		);
		await hold.reached;
		return { read, reports, release: hold.release };
	}

	test("removing an expired entry never deletes a newer write from another process", async () => {
		const { root, a, b, file } = await twoProcesses();
		const unlink = vi.spyOn(fsOps, "unlink");
		const { read, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		release();
		expect(await read).toBeUndefined();
		expect(await b.get(undefined, "k", [])).toBe("new");
		expect(await a.get(undefined, "k", [])).toBe("new");
		expect(
			unlink.mock.calls.every(([target]) => String(target).startsWith(path.join(root, "tmp"))),
		).toBe(true);
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("when an even newer write lands while an entry is checked, the newest one is kept", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "newer" });
		const link = fsOps.link;
		vi.spyOn(fsOps, "link").mockImplementationOnce(async (from, to) => {
			await b.set(undefined, { key: "k", value: "newest" });
			return link(from, to);
		});
		release();
		await read;
		expect(await a.get(undefined, "k", [])).toBe("newest");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("without hard links, a newer write is moved back instead", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		vi.spyOn(fsOps, "link").mockRejectedValueOnce(errno("EPERM"));
		release();
		await read;
		expect(await b.get(undefined, "k", [])).toBe("new");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("without hard links, an even newer write is kept", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		vi.spyOn(fsOps, "link").mockImplementationOnce(async () => {
			await b.set(undefined, { key: "k", value: "newest" });
			throw errno("EPERM");
		});
		release();
		await read;
		expect(await b.get(undefined, "k", [])).toBe("newest");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("without hard links, a newer write is dropped when its namespace was cleared meanwhile", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		vi.spyOn(fsOps, "link").mockImplementationOnce(async () => {
			await b.clear(undefined);
			throw errno("EPERM");
		});
		release();
		await read;
		expect(await b.get(undefined, "k", [])).toBeUndefined();
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("without hard links, a failed look for a newer write is reported, and a sweep puts the entry back", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, reports, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		vi.spyOn(fsOps, "link").mockRejectedValueOnce(errno("EPERM"));
		vi.spyOn(fsOps, "stat").mockRejectedValueOnce(errno("EACCES"));
		release();
		expect(await read).toBeUndefined();
		expect(reports).toMatchObject([{ code: "EACCES" }]);
		expect(readdirSync(path.join(root, "tmp"))).toHaveLength(1);
		vi.restoreAllMocks();
		await a.clearExpired();
		expect(await b.get(undefined, "k", [])).toBe("new");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("a newer write is dropped when its namespace was cleared meanwhile", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		const link = fsOps.link;
		vi.spyOn(fsOps, "link").mockImplementationOnce(async (from, to) => {
			await b.clear(undefined);
			return link(from, to);
		});
		release();
		await read;
		expect(await b.get(undefined, "k", [])).toBeUndefined();
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("a newer write is put back when checking it fails, and the failure is reported", async () => {
		const { root, a, b, file } = await twoProcesses();
		const { read, reports, release } = await readHeldAtCheck(a, file);
		await b.set(undefined, { key: "k", value: "new" });
		const open = fsOps.open;
		vi.spyOn(fsOps, "open").mockImplementation((async (target: string, ...rest: unknown[]) => {
			if (String(target).endsWith(".expired")) {
				throw errno("EIO");
			}

			return (open as (...args: unknown[]) => unknown)(target, ...rest);
		}) as never);
		release();
		expect(await read).toBeUndefined();
		vi.restoreAllMocks();
		expect(reports).toMatchObject([{ code: "EIO" }]);
		expect(await b.get(undefined, "k", [])).toBe("new");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("an entry another process already removed is skipped", async () => {
		const { a, b, file } = await twoProcesses();
		const { read, reports, release } = await readHeldAtCheck(a, file);
		expect(await b.delete(undefined, "k", [])).toBe(false);
		release();
		expect(await read).toBeUndefined();
		expect(reports).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});
});

describe("directory strategy recovery of entries being checked", () => {
	function park(root: string, name: string, content: string): string {
		const parked = path.join(root, "tmp", name);
		writeFileSync(parked, content);
		const old = new Date(Date.now() - 60 * 60 * 1000);
		utimesSync(parked, old, old);
		return parked;
	}

	test("a live entry left in tmp/ by a crash is put back at load, an expired one is removed", async () => {
		const root = path.join(tempDir(), "store");
		const first = new KeyvFs({ path: root, strategy: "directory" });
		await first.set("newer", "kept");
		await first.disconnect();
		const header = (key: string, expires?: number) =>
			`{"format":"keyv-fs","kind":"entry","version":1,"k":"${key}"${expires === undefined ? "" : `,"e":${expires}`},"t":"s"}\n`;
		// The entry was moved out of its shard, which a crash leaves in place.
		mkdirSync(path.dirname(entryFile(root, "live")), { recursive: true });
		park(root, "1-live.expired", `${header("live")}value`);
		park(root, "1-gone.expired", `${header("gone", 1)}value`);
		park(root, "1-newer.expired", `${header("newer")}stale`);
		park(root, "1-damaged.expired", "damaged");

		const second = new KeyvFs({ path: root, strategy: "directory" });
		await second.get("load");
		await second.disconnect();
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);

		const third = new KeyvFs({ path: root, strategy: "directory" });
		expect(await third.getMany(["live", "gone", "newer"])).toEqual(["value", undefined, "kept"]);
		await third.disconnect();
	});

	test("an entry left in tmp/ is put back before the first operation, however recently it was written", async () => {
		const root = path.join(tempDir(), "store");
		const first = new KeyvFs({ path: root, strategy: "directory" });
		await first.set("k", "v1");
		await first.disconnect();
		// Another process moved the entry aside to check it, then crashed. Moving keeps the
		// entry's file time, which is when it was written.
		renameSync(entryFile(root, "k"), path.join(root, "tmp", "1-crash.expired"));

		const second = new KeyvFs({ path: root, strategy: "directory" });
		expect(await second.delete("k")).toBe(true);
		await second.disconnect();
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		const third = new KeyvFs({ path: root, strategy: "directory" });
		expect(await third.get("k")).toBeUndefined();
		await third.disconnect();
	});

	test("a sweep puts back an entry another process left in tmp/", async () => {
		const { root, store } = newStore();
		await store.set("k", "v1");
		renameSync(entryFile(root, "k"), path.join(root, "tmp", "1-crash.expired"));
		expect(await store.get("k")).toBeUndefined();
		await store.clearExpired();
		expect(await store.get("k")).toBe("v1");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await store.disconnect();
	});

	test("an entry left in tmp/ that can't be put back yet stays for a later load", async () => {
		const root = path.join(tempDir(), "store");
		const first = new KeyvFs({ path: root, strategy: "directory" });
		await first.get("load");
		await first.disconnect();
		mkdirSync(path.dirname(entryFile(root, "live")), { recursive: true });
		park(
			root,
			"1-live.expired",
			'{"format":"keyv-fs","kind":"entry","version":1,"k":"live","t":"s"}\nvalue',
		);
		park(root, "1-vanishing.expired", "x");

		const open = fsOps.open;
		vi.spyOn(fsOps, "open").mockImplementation((async (target: string, ...rest: unknown[]) => {
			if (String(target).endsWith("1-vanishing.expired")) {
				throw errno("ENOENT");
			}

			return (open as (...args: unknown[]) => unknown)(target, ...rest);
		}) as never);
		vi.spyOn(fsOps, "link").mockRejectedValue(errno("EPERM"));
		vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
		const second = new KeyvFs({ path: root, strategy: "directory" });
		await second.get("load");
		await second.disconnect();
		vi.restoreAllMocks();
		expect(readdirSync(path.join(root, "tmp"))).toContain("1-live.expired");

		const third = new KeyvFs({ path: root, strategy: "directory" });
		await third.get("load");
		await third.disconnect();
		const fourth = new KeyvFs({ path: root, strategy: "directory" });
		expect(await fourth.get("live")).toBe("value");
		await fourth.disconnect();
	});

	test("expired entries are removed even when tmp/ went missing", async () => {
		const root = path.join(tempDir(), "store");
		const first = new KeyvFs({ path: root, strategy: "directory" });
		await first.set("k", "v", Date.now() + 60_000);
		await first.disconnect();
		rmSync(path.join(root, "tmp"), { recursive: true });
		skipAhead();
		const second = new KeyvFs({ path: root, strategy: "directory" });
		expect(await second.get("k")).toBeUndefined();
		expect(existsSync(entryFile(root, "k"))).toBe(false);
		await second.disconnect();
	});

	test("a clear called while an expired entry is being checked runs after the check", async () => {
		const { root, store } = newStore();
		await store.set("k", "old", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("open", (target) => target === file);
		const read = store.get("k");
		await hold.reached;
		let cleared = false;
		const clearing = store.clear().then(() => {
			cleared = true;
		});
		await tick();
		expect(cleared).toBe(false);
		hold.release();
		await Promise.all([read, clearing]);
		expect(await store.get("k")).toBeUndefined();
		await store.disconnect();
	});

	test("a damaged entry is left for the next write of its key", async () => {
		const { root, store } = newStore();
		await store.set("k", "old", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = store.get("k");
		await hold.reached;
		writeFileSync(file, "damaged\n");
		hold.release();
		expect(await read).toBeUndefined();
		expect(existsSync(file)).toBe(true);
		await store.set("k", "new");
		expect(await store.get("k")).toBe("new");
		await store.disconnect();
	});
});

describe("directory strategy cleanup failures", () => {
	test("a failed cleanup is reported, and the read still answers", async () => {
		const { root, store } = newStore();
		await store.set("k", "v", Date.now() + 60_000);
		await store.set("h", "v", Date.now() + 60_000);
		skipAhead();
		const errors = collectErrors(store);
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EACCES"));
		expect(await store.get("k")).toBeUndefined();
		expect(await store.has("h")).toBe(false);
		const entries: unknown[] = [];
		for await (const entry of store.iterator()) {
			entries.push(entry);
		}

		expect(entries).toEqual([]);
		expect(errors).toHaveLength(4);
		rename.mockRestore();
		expect(existsSync(entryFile(root, "k"))).toBe(true);
		await store.clearExpired();
		expect(existsSync(entryFile(root, "k"))).toBe(false);
		await store.disconnect();
	});

	test("many single-key operations at once stay within the open-file limit", async () => {
		const { store } = newStore();
		await store.get("load");
		let open = 0;
		let peak = 0;
		for (const method of ["open", "readFile", "writeFile", "readdir"] as const) {
			const original = fsOps[method] as (...args: unknown[]) => Promise<unknown>;
			vi.spyOn(fsOps, method).mockImplementation((async (...args: unknown[]) => {
				open++;
				peak = Math.max(peak, open);
				try {
					return await original(...args);
				} finally {
					open--;
				}
			}) as never);
		}

		const keys = Array.from({ length: 3000 }, (_, index) => `key-${index}`);
		await Promise.all(keys.map((key) => store.set(key, key)));
		const values = await Promise.all(keys.map((key) => store.get(key)));
		expect(values).toEqual(keys);
		expect(peak).toBeLessThanOrEqual(64);
		vi.restoreAllMocks();
		await store.disconnect();
	}, 30_000);
});

describe("directory strategy closing and sweeping", () => {
	test("disconnect waits for a cleanup that a read started", async () => {
		const { root, store } = newStore();
		await store.set("k", "v", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("open", (target) => target === file);
		const read = store.get("k");
		await hold.reached;
		let disconnected = false;
		const disconnecting = store.disconnect().then(() => {
			disconnected = true;
		});
		for (let index = 0; index < 5; index++) {
			await tick();
		}

		expect(disconnected).toBe(false);
		hold.release();
		await disconnecting;
		expect(await read).toBeUndefined();
		expect(existsSync(file)).toBe(false);
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
	});

	test("a read that finds an expired entry after disconnect leaves it for a later sweep", async () => {
		const { root, store } = newStore();
		await store.set("k", "v", Date.now() + 60_000);
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = store.get("k");
		await hold.reached;
		await store.disconnect();
		hold.release();
		expect(await read).toBeUndefined();
		expect(existsSync(file)).toBe(true);
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
	});

	test("a sweep goes on past an entry or a directory it can't read, then rejects", async () => {
		const { root, store } = newStore();
		const keys: string[] = [];
		const shards = new Set<string>();
		for (let index = 0; keys.length < 3; index++) {
			const key = `key-${index}`;
			const shard = hashName(key).slice(0, 2);
			if (!shards.has(shard)) {
				shards.add(shard);
				keys.push(key);
			}
		}

		await store.setMany(keys.map((key) => ({ key, value: "v", expires: Date.now() + 60_000 })));
		skipAhead();
		// The first shard listed can't be listed, and the first entry opened can't be read.
		const readdir = fsOps.readdir as (...args: unknown[]) => Promise<unknown>;
		let listFailed = false;
		vi.spyOn(fsOps, "readdir").mockImplementation((async (target: string, ...rest: unknown[]) => {
			if (!listFailed && path.dirname(target) === path.join(root, "data", "_")) {
				listFailed = true;
				throw errno("EACCES");
			}

			return readdir(target, ...rest);
		}) as never);
		const open = fsOps.open as (...args: unknown[]) => Promise<unknown>;
		let openFailed = false;
		vi.spyOn(fsOps, "open").mockImplementation((async (target: string, ...rest: unknown[]) => {
			if (!openFailed && target.endsWith(".kv")) {
				openFailed = true;
				throw errno("EIO");
			}

			return open(target, ...rest);
		}) as never);
		await expect(store.clearExpired()).rejects.toMatchObject({ code: "EACCES" });
		expect(openFailed).toBe(true);
		expect(keys.filter((key) => existsSync(entryFile(root, key)))).toHaveLength(2);

		vi.restoreAllMocks();
		await store.clearExpired();
		expect(keys.map((key) => existsSync(entryFile(root, key)))).toEqual([false, false, false]);
		await store.disconnect();
	});
});
