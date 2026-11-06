import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, vi } from "vitest";

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
	// Resolved, because stores use real paths and the temporary directory is a symbolic link on
	// some systems (macOS).
	const directory = realpathSync.native(mkdtempSync(path.join(tmpdir(), `${name}-`)));
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

/**
 * Moves the clock two minutes ahead, so entries set to expire within a minute have expired.
 * Only `Date` is faked, so timers and I/O keep running. Call `vi.useRealTimers()` afterwards.
 */
export function skipAhead(): void {
	const now = Date.now();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(now + 120_000);
}
