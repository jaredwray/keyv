import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const NODE_BUILTIN_MODULES = [
	"node:events",
	"node:fs",
	"node:path",
	"node:os",
	"node:crypto",
	"node:stream",
	"node:buffer",
	"node:util",
	"node:url",
	"node:http",
	"node:https",
	"node:net",
	"node:child_process",
	"node:cluster",
	"node:dgram",
	"node:dns",
	"node:tls",
	"node:zlib",
	"node:readline",
	"node:worker_threads",
];

// Bare specifier equivalents (without node: prefix)
const BARE_NODE_MODULES = [
	"events",
	"fs",
	"path",
	"os",
	"crypto",
	"stream",
	"buffer",
	"util",
	"http",
	"https",
	"net",
	"child_process",
	"cluster",
	"dgram",
	"dns",
	"tls",
	"zlib",
	"readline",
	"worker_threads",
];

const srcDir = resolve(import.meta.dirname, "../src");
const sourceFiles = readdirSync(srcDir)
	.filter((f) => f.endsWith(".ts"))
	.map((f) => ({
		name: f,
		content: readFileSync(resolve(srcDir, f), "utf-8"),
	}));

describe("browser compatibility - static analysis", () => {
	for (const file of sourceFiles) {
		test(`${file.name} has no Node.js built-in imports`, () => {
			for (const mod of NODE_BUILTIN_MODULES) {
				expect(file.content, `found "${mod}" in ${file.name}`).not.toMatch(
					new RegExp(`from\\s+["']${mod}["']`),
				);
				expect(file.content, `found "${mod}" in ${file.name}`).not.toMatch(
					new RegExp(`require\\s*\\(\\s*["']${mod}["']`),
				);
			}

			for (const mod of BARE_NODE_MODULES) {
				expect(
					file.content,
					`found bare "${mod}" import in ${file.name}`,
				).not.toMatch(new RegExp(`from\\s+["']${mod}["']`));
				expect(
					file.content,
					`found bare "${mod}" require in ${file.name}`,
				).not.toMatch(new RegExp(`require\\s*\\(\\s*["']${mod}["']`));
			}
		});
	}

	test("source files were found", () => {
		expect(sourceFiles.length).toBeGreaterThan(0);
	});
});
