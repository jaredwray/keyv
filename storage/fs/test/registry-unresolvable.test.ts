import path from "node:path";
import { expect, test, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const fs = await importOriginal<typeof import("node:fs")>();
	const realpathSync = Object.assign(
		() => {
			throw new Error("EACCES: simulated");
		},
		{
			native: () => {
				throw new Error("EACCES: simulated");
			},
		},
	);
	return { ...fs, realpathSync, default: { ...fs, realpathSync } };
});

test("the key is the absolute path when no part of it can be resolved", async () => {
	const { registryKey } = await import("../src/registry.js");
	expect(registryKey("some/where/store.jsonl")).toBe(path.resolve("some/where/store.jsonl"));
});
