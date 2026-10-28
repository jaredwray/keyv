// Runs the benchmark for each store size in its own process and prints the combined tables.
// Pass --large to add a 100,000-entry run.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { environment, formatMarkdown, type SizeResult } from "./utils.js";

export function runAll(): SizeResult[] {
	const sizes = process.argv.includes("--large") ? [1_000, 10_000, 100_000] : [1_000, 10_000];
	const results: SizeResult[] = [];
	for (const size of sizes) {
		const output = path.join(tmpdir(), `keyv-fs-bench-${process.pid}-${size}.json`);
		execFileSync(
			process.execPath,
			[
				"--import",
				"tsx",
				path.join(import.meta.dirname, "run.ts"),
				"--size",
				String(size),
				"--output",
				output,
			],
			{ stdio: "inherit" },
		);
		results.push(JSON.parse(readFileSync(output, "utf8")) as SizeResult);
		rmSync(output, { force: true });
	}

	return results;
}

if (import.meta.filename === process.argv[1]) {
	console.log(formatMarkdown(runAll(), environment()));
}
