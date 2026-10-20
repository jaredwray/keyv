import { chmodSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	atomicWriteFile,
	fileMode,
	fsOps,
	hasCode,
	KeyedMutex,
	mapLimit,
	RwGate,
	readdirOrEmpty,
	readFirstLine,
	readLines,
	renameWithRetry,
	runtime,
	unlinkIfExists,
} from "../src/io.js";
import { tempDir } from "./helpers.js";

function errno(code: string): NodeJS.ErrnoException {
	return Object.assign(new Error(code), { code });
}

afterEach(() => {
	vi.restoreAllMocks();
	runtime.platform = process.platform;
});

test("hasCode matches system error codes", () => {
	expect(hasCode(errno("ENOENT"), "ENOENT")).toBe(true);
	expect(hasCode(errno("EACCES"), "ENOENT", "EACCES")).toBe(true);
	expect(hasCode(errno("EACCES"), "ENOENT")).toBe(false);
	expect(hasCode(new Error("x"), "ENOENT")).toBe(false);
	expect(hasCode(null, "ENOENT")).toBe(false);
	expect(hasCode("ENOENT", "ENOENT")).toBe(false);
});

describe("renameWithRetry", () => {
	test("tries once outside Windows", async () => {
		runtime.platform = "linux";
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EPERM"));
		await expect(renameWithRetry("a", "b")).rejects.toThrow("EPERM");
		expect(rename).toHaveBeenCalledTimes(1);
	});

	test("retries a busy target on Windows", async () => {
		runtime.platform = "win32";
		const rename = vi
			.spyOn(fsOps, "rename")
			.mockRejectedValueOnce(errno("EPERM"))
			.mockRejectedValueOnce(errno("EBUSY"))
			.mockResolvedValue(undefined);
		await renameWithRetry("a", "b");
		expect(rename).toHaveBeenCalledTimes(3);
	});

	test("gives up on Windows after ten tries", async () => {
		runtime.platform = "win32";
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EACCES"));
		await expect(renameWithRetry("a", "b")).rejects.toThrow("EACCES");
		expect(rename).toHaveBeenCalledTimes(10);
	});

	test("does not retry other errors on Windows", async () => {
		runtime.platform = "win32";
		const rename = vi.spyOn(fsOps, "rename").mockRejectedValue(errno("ENOENT"));
		await expect(renameWithRetry("a", "b")).rejects.toThrow("ENOENT");
		expect(rename).toHaveBeenCalledTimes(1);
	});
});

describe("atomicWriteFile", () => {
	test("writes each line followed by a newline and leaves no temporary file", async () => {
		const directory = tempDir();
		const file = path.join(directory, "store.jsonl");
		await atomicWriteFile(file, ["a", "b"]);
		expect(readFileSync(file, "utf8")).toBe("a\nb\n");
		expect(readdirSync(directory)).toEqual(["store.jsonl"]);
	});

	test("writes large files in pieces", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const line = "x".repeat(300_000);
		await atomicWriteFile(file, [line, line, line, line, line]);
		expect(readFileSync(file, "utf8")).toBe(`${line}\n`.repeat(5));
		await atomicWriteFile(file, []);
		expect(readFileSync(file, "utf8")).toBe("");
	});

	test("gives the file the permissions it is asked for", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		writeFileSync(file, "old");
		chmodSync(file, 0o600);
		const mode = await fileMode(file);
		expect(mode).toBe(0o600);
		await atomicWriteFile(file, ["new"], mode);
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(readFileSync(file, "utf8")).toBe("new\n");
	});

	test("creates the directory when it is missing", async () => {
		const file = path.join(tempDir(), "a", "b", "store.jsonl");
		await atomicWriteFile(file, ["x"]);
		expect(readFileSync(file, "utf8")).toBe("x\n");
	});

	test("removes the temporary file when the rename fails", async () => {
		const directory = tempDir();
		const file = path.join(directory, "store.jsonl");
		writeFileSync(file, "old");
		vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
		await expect(atomicWriteFile(file, ["new"])).rejects.toThrow("EIO");
		expect(readdirSync(directory)).toEqual(["store.jsonl"]);
		expect(readFileSync(file, "utf8")).toBe("old");
	});

	test("rethrows when the temporary file can't be created", async () => {
		vi.spyOn(fsOps, "open").mockRejectedValue(errno("EACCES"));
		await expect(atomicWriteFile(path.join(tempDir(), "f"), ["x"])).rejects.toThrow("EACCES");
	});
});

test("fileMode reads permissions and treats a missing file as having none", async () => {
	const directory = tempDir();
	expect(await fileMode(path.join(directory, "missing"))).toBeUndefined();
	vi.spyOn(fsOps, "stat").mockRejectedValue(errno("EACCES"));
	await expect(fileMode(directory)).rejects.toThrow("EACCES");
});

describe("readLines", () => {
	test("splits lines across read chunks and keeps a final line without a newline", async () => {
		const file = path.join(tempDir(), "lines");
		const long = "é".repeat(70_000);
		writeFileSync(file, `one\n${long}\n\nlast`);
		const lines: string[] = [];
		for await (const line of readLines(file)) {
			lines.push(line);
		}

		expect(lines).toEqual(["one", long, "", "last"]);
	});

	test("yields nothing for an empty file and does not split on \\r or U+2028", async () => {
		const empty = path.join(tempDir(), "empty");
		writeFileSync(empty, "");
		const none: string[] = [];
		for await (const line of readLines(empty)) {
			none.push(line);
		}

		expect(none).toEqual([]);

		const file = path.join(tempDir(), "mixed");
		writeFileSync(file, "a\rb c\n");
		const lines: string[] = [];
		for await (const line of readLines(file)) {
			lines.push(line);
		}

		expect(lines).toEqual(["a\rb c"]);
	});
});

describe("readFirstLine", () => {
	test("reads up to the first newline, across reads", async () => {
		const directory = tempDir();
		const short = path.join(directory, "short");
		writeFileSync(short, "head\nbody");
		expect(await readFirstLine(short)).toBe("head");

		const long = path.join(directory, "long");
		const header = "h".repeat(10_000);
		writeFileSync(long, `${header}\nbody`);
		expect(await readFirstLine(long)).toBe(header);

		const noNewline = path.join(directory, "no-newline");
		writeFileSync(noNewline, "only");
		expect(await readFirstLine(noNewline)).toBe("only");
	});

	test("returns undefined for a missing file and rethrows other errors", async () => {
		const directory = tempDir();
		expect(await readFirstLine(path.join(directory, "missing"))).toBeUndefined();
		const file = path.join(directory, "file");
		writeFileSync(file, "x");
		expect(await readFirstLine(path.join(file, "below"))).toBeUndefined();
		await expect(readFirstLine(directory)).rejects.toThrow();
		vi.spyOn(fsOps, "open").mockRejectedValue(errno("EACCES"));
		await expect(readFirstLine(file)).rejects.toThrow("EACCES");
	});
});

test("readdirOrEmpty treats a missing directory as empty", async () => {
	const directory = tempDir();
	mkdirSync(path.join(directory, "sub"));
	expect(await readdirOrEmpty(directory)).toEqual(["sub"]);
	expect(await readdirOrEmpty(path.join(directory, "missing"))).toEqual([]);
	vi.spyOn(fsOps, "readdir").mockRejectedValue(errno("EACCES"));
	await expect(readdirOrEmpty(directory)).rejects.toThrow("EACCES");
});

test("unlinkIfExists reports whether it removed a file", async () => {
	const directory = tempDir();
	const file = path.join(directory, "file");
	writeFileSync(file, "x");
	expect(await unlinkIfExists(file)).toBe(true);
	expect(await unlinkIfExists(file)).toBe(false);
	await expect(unlinkIfExists(directory)).rejects.toThrow();
});

describe("mapLimit", () => {
	test("keeps input order and runs at most `limit` at once", async () => {
		let running = 0;
		let peak = 0;
		const results = await mapLimit([5, 1, 4, 2, 3], 2, async (value) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, value));
			running--;
			return value * 10;
		});
		expect(results).toEqual([50, 10, 40, 20, 30]);
		expect(peak).toBe(2);
		expect(await mapLimit([], 4, async () => 1)).toEqual([]);
	});

	test("waits for every call, then rejects with the first error", async () => {
		const finished: number[] = [];
		await expect(
			mapLimit([1, 2, 3], 3, async (value) => {
				await new Promise((resolve) => setTimeout(resolve, value * 5));
				finished.push(value);
				if (value !== 3) {
					throw new Error(`fail ${value}`);
				}
			}),
		).rejects.toThrow("fail 1");
		expect(finished).toEqual([1, 2, 3]);
	});
});

describe("KeyedMutex", () => {
	test("runs one call per key at a time, in call order", async () => {
		const mutex = new KeyedMutex();
		const events: string[] = [];
		const run = (key: string, label: string, ms: number) =>
			mutex.run(key, async () => {
				events.push(`start ${label}`);
				await new Promise((resolve) => setTimeout(resolve, ms));
				events.push(`end ${label}`);
				return label;
			});
		const results = await Promise.all([run("a", "a1", 20), run("a", "a2", 1), run("b", "b1", 1)]);
		expect(results).toEqual(["a1", "a2", "b1"]);
		expect(events.indexOf("end a1")).toBeLessThan(events.indexOf("start a2"));
		expect(events.indexOf("start b1")).toBeLessThan(events.indexOf("end a1"));
	});

	test("releases the key when a call fails", async () => {
		const mutex = new KeyedMutex();
		await expect(
			mutex.run("a", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await mutex.run("a", async () => "next")).toBe("next");
	});
});

describe("RwGate", () => {
	test("grants in call order: shared holders together, exclusive alone", async () => {
		const gate = new RwGate();
		const events: string[] = [];
		const hold = async (label: string, exclusive: boolean) => {
			const release = await (exclusive ? gate.exclusive() : gate.shared());
			events.push(`start ${label}`);
			await new Promise((resolve) => setTimeout(resolve, 5));
			events.push(`end ${label}`);
			release();
			release();
		};

		await Promise.all([hold("s1", false), hold("s2", false), hold("x", true), hold("s3", false)]);
		expect(events.slice(0, 2)).toEqual(["start s1", "start s2"]);
		expect(events.indexOf("start x")).toBeGreaterThan(events.indexOf("end s2"));
		expect(events.indexOf("start x")).toBeGreaterThan(events.indexOf("end s1"));
		expect(events.indexOf("start s3")).toBeGreaterThan(events.indexOf("end x"));
	});

	test("an exclusive holder blocks a later exclusive request", async () => {
		const gate = new RwGate();
		const first = await gate.exclusive();
		let second = false;
		const pending = gate.exclusive().then((release) => {
			second = true;
			release();
		});
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(second).toBe(false);
		first();
		await pending;
		expect(second).toBe(true);
	});
});

test("a failed cleanup does not hide the error that caused it", async () => {
	vi.spyOn(fsOps, "rename").mockRejectedValue(errno("EIO"));
	vi.spyOn(fsOps, "unlink").mockRejectedValue(errno("EPERM"));
	await expect(atomicWriteFile(path.join(tempDir(), "f"), ["x"])).rejects.toThrow("EIO");
});

describe("Semaphore", () => {
	test("runs at most its slots at once, in call order", async () => {
		const { Semaphore } = await import("../src/io.js");
		const semaphore = new Semaphore(2);
		let running = 0;
		let peak = 0;
		const started: number[] = [];
		await Promise.all(
			Array.from({ length: 6 }, (_, index) =>
				semaphore.run(async () => {
					started.push(index);
					running++;
					peak = Math.max(peak, running);
					await new Promise((resolve) => setTimeout(resolve, 2));
					running--;
				}),
			),
		);
		expect(peak).toBe(2);
		expect(started).toEqual([0, 1, 2, 3, 4, 5]);
	});

	test("frees the slot when a call fails", async () => {
		const { Semaphore } = await import("../src/io.js");
		const semaphore = new Semaphore(1);
		await expect(
			semaphore.run(async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(await semaphore.run(async () => "next")).toBe("next");
	});
});
