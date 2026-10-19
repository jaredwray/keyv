import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const directories: string[] = [];

afterAll(() => {
	for (const directory of directories) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/**
 * Creates a temporary directory that is removed after the test file finishes.
 * @param name - A label for the directory name.
 */
export function tempDir(name = "keyv-fs"): string {
	const directory = mkdtempSync(path.join(tmpdir(), `${name}-`));
	directories.push(directory);
	return directory;
}

export const strategies = ["file", "directory"] as const;

/**
 * A fresh store location for a strategy: a file for `"file"`, a directory for `"directory"`.
 * @param strategy - The strategy.
 */
export function freshLocation(strategy: "file" | "directory"): string {
	return path.join(tempDir(), strategy === "file" ? "store.jsonl" : "store");
}

/** Resolves after pending immediates and I/O callbacks have run. */
export function tick(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Creates an error like the ones Node.js file system calls throw.
 * @param code - The error code, such as `"EIO"`.
 */
export function errno(code: string): NodeJS.ErrnoException {
	return Object.assign(new Error(`${code}: simulated`), { code });
}
