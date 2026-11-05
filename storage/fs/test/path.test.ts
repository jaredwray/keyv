import { mkdirSync, readdirSync, statSync, symlinkSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyvFs from "../src/index.js";
import { fsOps, runtime } from "../src/io.js";
import { strategies, tempDir } from "./helpers.js";

afterEach(() => {
	vi.restoreAllMocks();
});

/** A store path whose parent directory does not exist yet. */
function storeBelowMissing(strategy: (typeof strategies)[number]) {
	const base = tempDir();
	const missing = path.join(base, "missing");
	const location = path.join(missing, strategy === "file" ? "store.jsonl" : "store");
	return { missing, location, elsewhere: tempDir() };
}

describe.skipIf(process.platform === "win32").each(strategies)("%s strategy", (strategy) => {
	test("a symbolic link put in a missing directory of the path after construction is refused", async () => {
		const { missing, location, elsewhere } = storeBelowMissing(strategy);
		const store = new KeyvFs({ path: location, strategy });
		symlinkSync(elsewhere, missing);
		await expect(store.set("k", "v")).rejects.toThrow(/symbolic link/);
		expect(readdirSync(elsewhere)).toEqual([]);
		await store.disconnect();
	});

	test("a symbolic link put in place while the directory is created is refused", async () => {
		const { missing, location, elsewhere } = storeBelowMissing(strategy);
		const store = new KeyvFs({ path: location, strategy });
		const mkdir = fsOps.mkdir as (...args: unknown[]) => Promise<unknown>;
		vi.spyOn(fsOps, "mkdir").mockImplementation((async (target: string, ...rest: unknown[]) => {
			if (target.startsWith(missing)) {
				symlinkSync(elsewhere, missing);
				vi.mocked(fsOps.mkdir).mockImplementation(mkdir as never);
			}

			return mkdir(target, ...rest);
		}) as never);
		await expect(store.set("k", "v")).rejects.toThrow(/symbolic link/);
		// mkdir made the directory before the check, but nothing was written into it.
		expect(
			readdirSync(elsewhere, { recursive: true }).filter((name) => name.includes(".")),
		).toEqual([]);
		// The "file" strategy keeps the value in memory, so disconnect() tries the save again and
		// reports that it was refused again.
		await store.disconnect().catch((error: Error) => {
			expect(error.message).toMatch(/symbolic link/);
		});
	});

	test("a missing directory that another user created is refused", async () => {
		const { missing, location } = storeBelowMissing(strategy);
		const store = new KeyvFs({ path: location, strategy });
		mkdirSync(missing);
		vi.spyOn(runtime, "uid").mockReturnValue((process.getuid?.() ?? 0) + 1);
		await expect(store.set("k", "v")).rejects.toThrow(/another user created/);
		await store.disconnect();
	});

	test("directories it creates are for their owner only, and the path check passes", async () => {
		const { missing, location } = storeBelowMissing(strategy);
		const store = new KeyvFs({ path: location, strategy });
		await store.set("k", "v");
		await store.set("k", "w");
		expect(await store.get("k")).toBe("w");
		await store.disconnect();
		expect(statSync(missing).mode & 0o777).toBe(0o700);
	});
});

test("without a user ID, as on Windows, only symbolic links are checked", async () => {
	const base = tempDir();
	const missing = path.join(base, "missing");
	const store = new KeyvFs(path.join(missing, "store.jsonl"));
	mkdirSync(missing);
	vi.spyOn(runtime, "uid").mockReturnValue(undefined);
	await store.set("k", "v");
	expect(await store.get("k")).toBe("v");
	await store.disconnect();
});
