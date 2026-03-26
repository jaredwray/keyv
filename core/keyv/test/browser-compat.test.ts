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

// Derive bare specifiers from the node: prefixed list
const BARE_NODE_MODULES = NODE_BUILTIN_MODULES.map((mod) =>
	mod.replace("node:", ""),
);

// Patterns that catch all import forms:
//   import ... from "mod"
//   import "mod" (side-effect)
//   import("mod") (dynamic)
//   require("mod")
function buildPatterns(mod: string): RegExp[] {
	const escaped = mod.replace("/", "\\/");
	return [
		new RegExp(`from\\s+["']${escaped}["']`),
		new RegExp(`import\\s+["']${escaped}["']`),
		new RegExp(`import\\s*\\(\\s*["']${escaped}["']`),
		new RegExp(`require\\s*\\(\\s*["']${escaped}["']`),
	];
}

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
			for (const mod of [...NODE_BUILTIN_MODULES, ...BARE_NODE_MODULES]) {
				for (const pattern of buildPatterns(mod)) {
					expect(
						file.content,
						`found "${mod}" (${pattern.source}) in ${file.name}`,
					).not.toMatch(pattern);
				}
			}
		});
	}

	test("source files were found", () => {
		expect(sourceFiles.length).toBeGreaterThan(0);
	});
});
