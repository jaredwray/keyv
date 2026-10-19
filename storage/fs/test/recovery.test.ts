import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Keyv from "keyv";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvFs, { KeyvFsCorruptionError, KeyvFsFormatError } from "../src/index.js";
import { fsOps } from "../src/io.js";
import { errno, tempDir, tick } from "./helpers.js";

afterEach(() => {
	vi.restoreAllMocks();
});

const HEADER = '{"format":"keyv-fs","kind":"file","version":1}';
const RECORD = '{"op":"set","k":"a","s":"1"}';

function storeFile(content: string): string {
	const file = path.join(tempDir(), "store.jsonl");
	writeFileSync(file, content);
	return file;
}

function corruptFiles(file: string): string[] {
	return readdirSync(path.dirname(file)).filter((name) => name.includes(".corrupt-"));
}

describe("file strategy recovery", () => {
	test("an empty file is an empty store", async () => {
		const file = storeFile("");
		const store = new KeyvFs(file);
		expect(await store.get("a")).toBeUndefined();
		await store.set("a", "1");
		await store.disconnect();
		expect(readFileSync(file, "utf8").split("\n")[0]).toBe(HEADER);
	});

	test("a file without a trailing newline after the checkpoint loads", async () => {
		const file = storeFile(`${HEADER}\n${RECORD}\n{"op":"checkpoint","count":1}`);
		const store = new KeyvFs(file);
		expect(await store.get("a")).toBe("1");
		await store.disconnect();
	});

	const foreign = {
		"a keyv-file store": '{"cache":[["keyv:a",{"value":"\\"x\\""}]],"lastExpire":0}',
		garbage: "hello world\n",
		"NUL bytes": "\u0000\u0000\u0000",
		"another kind": '{"format":"keyv-fs","kind":"directory","version":1}\n',
		"a newer version": '{"format":"keyv-fs","kind":"file","version":2}\n',
	};

	for (const [name, content] of Object.entries(foreign)) {
		test(`${name} is refused and left untouched`, async () => {
			const file = storeFile(content);
			const store = new KeyvFs(file);
			await expect(store.get("a")).rejects.toThrow(KeyvFsFormatError);
			await expect(store.set("a", "1")).rejects.toThrow(KeyvFsFormatError);
			expect(readFileSync(file, "utf8")).toBe(content);
			expect(corruptFiles(file)).toEqual([]);
			await store.disconnect();
			expect(readFileSync(file, "utf8")).toBe(content);
		});
	}

	test("a refused file is read again once it is fixed", async () => {
		const file = storeFile("not a store\n");
		const store = new KeyvFs(file);
		await expect(store.get("a")).rejects.toThrow(KeyvFsFormatError);
		writeFileSync(file, `${HEADER}\n${RECORD}\n{"op":"checkpoint","count":1}\n`);
		expect(await store.get("a")).toBe("1");
		await store.disconnect();
	});

	const damaged = {
		"a file that ends before its checkpoint": `${HEADER}\n${RECORD}\n`,
		"a torn last line": `${HEADER}\n${RECORD}\n{"op":"checkpo`,
		"a bad record": `${HEADER}\nnot json\n{"op":"checkpoint","count":0}\n`,
		"a wrong count": `${HEADER}\n${RECORD}\n{"op":"checkpoint","count":2}\n`,
		"data after the checkpoint": `${HEADER}\n{"op":"checkpoint","count":0}\n${RECORD}\n`,
		"a blank line": `${HEADER}\n\n{"op":"checkpoint","count":0}\n`,
		"a value that can't be read": `${HEADER}\n{"op":"set","k":"a","j":"{broken"}\n{"op":"checkpoint","count":1}\n`,
	};

	for (const [name, content] of Object.entries(damaged)) {
		test(`${name} is moved aside, kept byte for byte, and reported once`, async () => {
			const file = storeFile(content);
			const store = new KeyvFs(file);
			const keyv = new Keyv({ store });
			const errors: unknown[] = [];
			keyv.on("error", (error) => errors.push(error));

			expect(await keyv.get("a")).toBeUndefined();
			expect(errors).toHaveLength(1);
			const error = errors[0] as KeyvFsCorruptionError;
			expect(error).toBeInstanceOf(KeyvFsCorruptionError);
			expect(error.path).toBe(file);
			expect(error.quarantinePath).toMatch(/store\.jsonl\.corrupt-\d{8}T\d{6}Z-[0-9a-f]{4}$/);
			expect(readFileSync(error.quarantinePath as string, "utf8")).toBe(content);
			expect(existsSync(file)).toBe(false);

			await keyv.set("b", "2");
			expect(await keyv.get("b")).toBe("2");
			expect(errors).toHaveLength(1);
			await keyv.disconnect();
		});
	}

	test("with no error listener, only the first operation rejects", async () => {
		const file = storeFile(`${HEADER}\n${RECORD}\n`);
		const uncaught = vi.fn();
		process.on("uncaughtException", uncaught);
		try {
			const keyv = new Keyv({ store: new KeyvFs(file) });
			await expect(keyv.get("a")).rejects.toThrow(KeyvFsCorruptionError);
			expect(await keyv.get("a")).toBeUndefined();
			await tick();
			expect(uncaught).not.toHaveBeenCalled();
			await keyv.disconnect();
		} finally {
			process.off("uncaughtException", uncaught);
		}
	});

	test("two first operations in the same tick: one rejects, one resolves, one file is moved", async () => {
		const file = storeFile(`${HEADER}\n${RECORD}\n`);
		const store = new KeyvFs(file);
		const keyv = new Keyv({ store });
		const results = await Promise.allSettled([keyv.get("a"), keyv.get("b")]);
		expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
		expect(corruptFiles(file)).toHaveLength(1);
		await keyv.disconnect();
	});

	test("disconnect before any operation never loads or moves the file", async () => {
		const content = `${HEADER}\n${RECORD}\n`;
		const file = storeFile(content);
		const store = new KeyvFs(file);
		await store.disconnect();
		expect(readFileSync(file, "utf8")).toBe(content);
		expect(corruptFiles(file)).toEqual([]);
	});

	test("when the damaged file can't be moved, operations reject and nothing is overwritten", async () => {
		const content = `${HEADER}\n${RECORD}\n`;
		const file = storeFile(content);
		const store = new KeyvFs(file);
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EACCES"));
		await expect(store.set("a", "2")).rejects.toThrow("EACCES");
		expect(readFileSync(file, "utf8")).toBe(content);
		rename.mockRestore();

		const errors: unknown[] = [];
		store.on("error", (error) => errors.push(error));
		expect(await store.get("a")).toBeUndefined();
		expect(errors).toHaveLength(1);
		await store.disconnect();
	});

	test("an error reading the file rejects without moving it", async () => {
		const content = `${HEADER}\n${RECORD}\n{"op":"checkpoint","count":1}\n`;
		const file = storeFile(content);
		const store = new KeyvFs(file);
		vi.spyOn(fsOps, "createReadStream").mockImplementation(() => {
			throw errno("EIO");
		});
		await expect(store.get("a")).rejects.toThrow("EIO");
		vi.restoreAllMocks();
		expect(await store.get("a")).toBe("1");
		await store.disconnect();
	});

	test("expired records are skipped when the file loads", async () => {
		const file = storeFile(
			`${HEADER}\n{"op":"set","k":"old","e":1,"s":"x"}\n${RECORD}\n{"op":"checkpoint","count":2}\n`,
		);
		const store = new KeyvFs(file);
		expect(await store.getMany(["old", "a"])).toEqual([undefined, "1"]);
		await store.disconnect();
	});
});

describe("directory strategy recovery", () => {
	function marker(root: string): string {
		return path.join(root, "keyv-fs.json");
	}

	test("creates the marker in a new or existing directory", async () => {
		const root = tempDir();
		writeFileSync(path.join(root, "unrelated.txt"), "kept");
		const store = new KeyvFs({ path: root, strategy: "directory" });
		await store.set("k", "v");
		expect(JSON.parse(readFileSync(marker(root), "utf8"))).toEqual({
			format: "keyv-fs",
			kind: "directory",
			version: 1,
		});
		expect(readFileSync(path.join(root, "unrelated.txt"), "utf8")).toBe("kept");
		await store.disconnect();
	});

	const markers = {
		garbage: "nope",
		"a file store header": '{"format":"keyv-fs","kind":"file","version":1}',
		"a newer version": '{"format":"keyv-fs","kind":"directory","version":2}',
	};

	for (const [name, content] of Object.entries(markers)) {
		test(`a marker with ${name} is refused`, async () => {
			const root = tempDir();
			writeFileSync(marker(root), content);
			const store = new KeyvFs({ path: root, strategy: "directory" });
			await expect(store.get("k")).rejects.toThrow(KeyvFsFormatError);
			expect(readFileSync(marker(root), "utf8")).toBe(content);
			expect(existsSync(path.join(root, "data"))).toBe(false);
			await store.disconnect();
		});
	}

	test("an empty marker, left by an interrupted first open, is written again", async () => {
		const root = tempDir();
		writeFileSync(marker(root), "");
		const store = new KeyvFs({ path: root, strategy: "directory" });
		await store.set("k", "v");
		expect(await store.get("k")).toBe("v");
		expect(JSON.parse(readFileSync(marker(root), "utf8")).kind).toBe("directory");
		await store.disconnect();
	});

	test("two stores opening a new directory at once both load, and leave no temporary files", async () => {
		const { DirectoryStrategy } = await import("../src/strategies/directory.js");
		const root = path.join(tempDir(), "store");
		const a = new DirectoryStrategy(root, 1000);
		const b = new DirectoryStrategy(root, 1000);
		await Promise.all([a.load(), b.load()]);
		expect(readdirSync(root).sort()).toEqual(["data", "keyv-fs.json", "tmp", "trash"]);
		await Promise.all([a.close(), b.close()]);
	});

	test("errors reading or creating the marker reject", async () => {
		const root = tempDir();
		const store = new KeyvFs({ path: root, strategy: "directory" });
		vi.spyOn(fsOps, "readFile").mockRejectedValueOnce(errno("EACCES"));
		await expect(store.get("k")).rejects.toThrow("EACCES");
		vi.spyOn(fsOps, "open").mockRejectedValueOnce(errno("EROFS"));
		await expect(store.get("k")).rejects.toThrow("EROFS");
		vi.restoreAllMocks();
		expect(await store.get("k")).toBeUndefined();
		await store.disconnect();
	});
});
