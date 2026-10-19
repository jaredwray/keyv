import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
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
		return { root, a, b };
	}

	test("removing an expired entry never deletes a newer write from another process", async () => {
		const { root, a, b } = await twoProcesses();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = a.get(undefined, "k", []);
		await hold.reached;
		await b.set(undefined, { key: "k", value: "new" });
		hold.release();
		expect(await read).toBeUndefined();
		expect(await b.get(undefined, "k", [])).toBe("new");
		expect(await a.get(undefined, "k", [])).toBe("new");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("when an even newer write lands while an entry is checked, the newest one is kept", async () => {
		const { root, a, b } = await twoProcesses();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = a.get(undefined, "k", []);
		await hold.reached;
		await b.set(undefined, { key: "k", value: "newer" });
		const link = fsOps.link;
		vi.spyOn(fsOps, "link").mockImplementationOnce(async (from, to) => {
			await b.set(undefined, { key: "k", value: "newest" });
			return link(from, to);
		});
		hold.release();
		await read;
		expect(await a.get(undefined, "k", [])).toBe("newest");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("without hard links, a newer write is moved back instead", async () => {
		const { root, a, b } = await twoProcesses();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = a.get(undefined, "k", []);
		await hold.reached;
		await b.set(undefined, { key: "k", value: "new" });
		vi.spyOn(fsOps, "link").mockRejectedValueOnce(errno("EPERM"));
		hold.release();
		await read;
		expect(await b.get(undefined, "k", [])).toBe("new");
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("a newer write is dropped when its namespace was cleared meanwhile", async () => {
		const { root, a, b } = await twoProcesses();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = a.get(undefined, "k", []);
		await hold.reached;
		await b.set(undefined, { key: "k", value: "new" });
		const link = fsOps.link;
		vi.spyOn(fsOps, "link").mockImplementationOnce(async (from, to) => {
			await b.clear(undefined);
			return link(from, to);
		});
		hold.release();
		await read;
		expect(await b.get(undefined, "k", [])).toBeUndefined();
		expect(readdirSync(path.join(root, "tmp"))).toEqual([]);
		await Promise.all([a.close(), b.close()]);
	});

	test("an entry another process already removed is skipped", async () => {
		const { root, a, b } = await twoProcesses();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = a.get(undefined, "k", []);
		await hold.reached;
		expect(await b.delete(undefined, "k", [])).toBe(false);
		hold.release();
		expect(await read).toBeUndefined();
		await Promise.all([a.close(), b.close()]);
	});

	test("a damaged entry found while checking is removed", async () => {
		const { root, a } = await twoProcesses();
		await a.set(undefined, { key: "k", value: "old", expires: Date.now() + 60_000 });
		skipAhead();
		const file = entryFile(root, "k");
		const hold = holdCall("readFile", (target) => target === file);
		const read = a.get(undefined, "k", []);
		await hold.reached;
		writeFileSync(file, "damaged\n");
		hold.release();
		await read;
		expect(existsSync(file)).toBe(false);
		await a.close();
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
		const keys = Array.from({ length: 3000 }, (_, index) => `key-${index}`);
		await Promise.all(keys.map((key) => store.set(key, key)));
		const values = await Promise.all(keys.map((key) => store.get(key)));
		expect(values).toEqual(keys);
		await store.disconnect();
	}, 30_000);
});

test("an entry moved aside for checking that then disappears is left gone", async () => {
	const { root, store } = newStore();
	await store.set("k", "v", Date.now() + 60_000);
	skipAhead();
	const open = fsOps.open;
	vi.spyOn(fsOps, "open").mockImplementation((async (file: string, ...rest: unknown[]) => {
		if (String(file).endsWith(".expired")) {
			throw errno("ENOENT");
		}

		return (open as (...args: unknown[]) => unknown)(file, ...rest);
	}) as never);
	expect(await store.get("k")).toBeUndefined();
	vi.restoreAllMocks();
	expect(existsSync(entryFile(root, "k"))).toBe(false);
	await store.disconnect();
});
