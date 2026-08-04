import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
	version: string;
	scripts: Record<string, string>;
	files: string[];
};

describe("preinstall", () => {
	test("ships setup files and executes setup.mjs", () => {
		expect(manifest.scripts.preinstall).toBe("node setup.mjs");
		expect(manifest.files).toContain("setup.mjs");
		expect(manifest.files).toContain("Math_Symbol.js");
		expect(() => {
			execFileSync(process.execPath, [resolve(packageRoot, "setup.mjs")], { stdio: "ignore" });
		}).not.toThrow();
	});
});
