import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvFs from "../src/index.js";
import { fsOps } from "../src/io.js";
import { errno, tempDir } from "./helpers.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("file strategy on disk", () => {
	test("writes a header, one record per entry and a checkpoint", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		await store.set("a", '{"value":"hello"}');
		store.namespace = "users";
		await store.set("b", '{"value":{"x":1},"expires":1760000660000}', 4_102_444_800_000);
		await store.set("raw", { value: Buffer.from("hi") });
		await store.disconnect();
		expect(readFileSync(file, "utf8")).toBe(
			[
				'{"format":"keyv-fs","kind":"file","version":1}',
				'{"op":"set","k":"a","s":"{\\"value\\":\\"hello\\"}"}',
				'{"op":"set","n":"users","k":"b","e":4102444800000,"s":"{\\"value\\":{\\"x\\":1},\\"expires\\":1760000660000}"}',
				'{"op":"set","n":"users","k":"raw","j":"{\\"value\\":\\":base64:aGk=\\"}"}',
				'{"op":"checkpoint","count":3}',
				"",
			].join("\n"),
		);
	});

	test("creates missing parent directories and leaves no temporary files", async () => {
		const directory = tempDir();
		const file = path.join(directory, "nested", "deeper", "store.jsonl");
		const store = new KeyvFs(file);
		await store.set("k", "v");
		await store.disconnect();
		expect(readdirSync(path.dirname(file))).toEqual(["store.jsonl"]);
	});

	test("removes temporary files left by an interrupted save, and nothing else", async () => {
		const directory = tempDir();
		const file = path.join(directory, "store.jsonl");
		writeFileSync(`${file}.1234.0123abcd.tmp`, "partial");
		writeFileSync(`${file}.corrupt-20260101T000000Z-abcd`, "kept");
		writeFileSync(`${file}.notes.tmp`, "kept");
		writeFileSync(path.join(directory, "other.1234.0123abcd.tmp"), "kept");
		const store = new KeyvFs(file);
		expect(await store.get("k")).toBeUndefined();
		expect(readdirSync(directory).sort()).toEqual([
			"other.1234.0123abcd.tmp",
			"store.jsonl.corrupt-20260101T000000Z-abcd",
			"store.jsonl.notes.tmp",
		]);
		await store.disconnect();
	});

	test("a failed save rejects the write, keeps the value in memory, and the next save writes it", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		await store.set("first", "1");
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValueOnce(errno("ENOSPC"));
		await expect(store.set("second", "2")).rejects.toThrow("ENOSPC");
		expect(rename).toHaveBeenCalled();
		expect(await store.get("second")).toBe("2");
		await store.set("third", "3");
		await store.disconnect();

		const reopened = new KeyvFs(file);
		expect(await reopened.getMany(["first", "second", "third"])).toEqual(["1", "2", "3"]);
		await reopened.disconnect();
	});

	test("round-trips a large store", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		const entries = Array.from({ length: 50_000 }, (_, index) => ({
			key: `key-${index}`,
			value: `value-${index}-${"x".repeat(index % 50)}`,
		}));
		await store.setMany(entries);
		await store.disconnect();

		const reopened = new KeyvFs(file);
		const sample = [0, 1, 777, 25_000, 49_999];
		expect(await reopened.getMany(sample.map((index) => `key-${index}`))).toEqual(
			sample.map((index) => entries[index].value),
		);
		let count = 0;
		for await (const _ of reopened.iterator()) {
			count++;
		}

		expect(count).toBe(50_000);
		await reopened.disconnect();
	});

	test("writeDelay batches writes made close together into one save", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file, { writeDelay: 30 });
		await store.get("load");
		const rename = vi.spyOn(fsOps, "rename");
		const first = store.set("a", "1");
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = store.set("b", "2");
		await Promise.all([first, second]);
		expect(rename).toHaveBeenCalledTimes(1);
		await store.disconnect();
	});

	test("a path that is a directory rejects each operation until it is fixed", async () => {
		const directory = tempDir();
		const file = path.join(directory, "store.jsonl");
		mkdirSync(file);
		const store = new KeyvFs(file);
		await expect(store.get("k")).rejects.toThrow();
		await expect(store.set("k", "v")).rejects.toThrow();
		const { rmSync } = await import("node:fs");
		rmSync(file, { recursive: true });
		expect(await store.set("k", "v")).toBe(true);
		expect(await store.get("k")).toBe("v");
		await store.disconnect();
	});

	test("clearing an empty namespace or deleting a missing key saves nothing", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		await store.set("k", "v");
		const rename = vi.spyOn(fsOps, "rename");
		store.namespace = "empty";
		await store.clear();
		await store.set("gone", "v", Date.now() - 1);
		expect(await store.delete("missing")).toBe(false);
		expect(rename).not.toHaveBeenCalled();
		await store.disconnect();
	});
});

describe("file strategy edge cases", () => {
	test("clearing a namespace whose entries all expired saves nothing", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		await store.set("short", "v", Date.now() + 20);
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(await store.get("short")).toBeUndefined();
		const rename = vi.spyOn(fsOps, "rename");
		await store.clear();
		expect(rename).not.toHaveBeenCalled();
		await store.disconnect();
	});

	test("a save leaves out entries that expired in memory", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(1_000_000);
			const file = path.join(tempDir(), "store.jsonl");
			const store = new KeyvFs(file);
			await store.set("short", "v", 1_000_010);
			vi.setSystemTime(1_000_020);
			await store.set("long", "v");
			await store.disconnect();
			const content = readFileSync(file, "utf8");
			expect(content).not.toContain('"short"');
			expect(content).toContain('{"op":"checkpoint","count":1}');
		} finally {
			vi.useRealTimers();
		}
	});

	test("a leftover temporary file that can't be removed does not stop the load", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		writeFileSync(`${file}.1234.0123abcd.tmp`, "partial");
		vi.spyOn(fsOps, "unlink").mockRejectedValue(errno("EPERM"));
		const store = new KeyvFs(file);
		expect(await store.get("k")).toBeUndefined();
		vi.restoreAllMocks();
		await store.disconnect();
	});
});

test("a load goes ahead when the earlier backend on the path failed to close", async () => {
	const { FileStrategy } = await import("../src/strategies/file.js");
	const file = path.join(tempDir(), "store.jsonl");
	const failedClose = Promise.reject(new Error("earlier close failed"));
	const strategy = new FileStrategy(file, 0, 1000, failedClose);
	await strategy.load();
	expect(strategy.loaded).toBe(true);
	await strategy.close();
});

test("closing during a load that fails still closes", async () => {
	const { FileStrategy } = await import("../src/strategies/file.js");
	const file = path.join(tempDir(), "store.jsonl");
	writeFileSync(file, "not a store\n");
	const strategy = new FileStrategy(file, 0, 1000);
	const loading = strategy.load();
	await strategy.close();
	await expect(loading).rejects.toThrow(/not a @keyv\/fs store file/);
	expect(strategy.loaded).toBe(false);
});

test("saves keep the store file's permissions", async () => {
	const { chmodSync, statSync } = await import("node:fs");
	const file = path.join(tempDir(), "store.jsonl");
	const first = new KeyvFs(file);
	await first.set("a", "1");
	await first.disconnect();
	chmodSync(file, 0o600);

	const second = new KeyvFs(file);
	await second.set("b", "2");
	expect(statSync(file).mode & 0o777).toBe(0o600);
	await second.disconnect();
});
