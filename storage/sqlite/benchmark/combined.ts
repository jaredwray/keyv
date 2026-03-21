import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type BenchmarkResult, formatCombinedMarkdown } from "./utils.js";

const cwd = resolve(import.meta.dirname, "..");
const timestamp = Date.now();
const nodeResultsPath = join(tmpdir(), `keyv-bench-node-${timestamp}.json`);
const bunResultsPath = join(tmpdir(), `keyv-bench-bun-${timestamp}.json`);

const allResults: BenchmarkResult[] = [];

// Run node-sqlite benchmark (node:sqlite + better-sqlite3)
try {
	console.log("Running node-sqlite benchmark...");
	execSync(`tsx benchmark/node-sqlite.ts --output ${nodeResultsPath}`, { cwd, stdio: "inherit" });
	const nodeResults: BenchmarkResult = JSON.parse(readFileSync(nodeResultsPath, "utf-8"));
	allResults.push(nodeResults);
	unlinkSync(nodeResultsPath);
} catch (error) {
	console.error("Failed to run node-sqlite benchmark:", (error as Error).message);
	try { unlinkSync(nodeResultsPath); } catch {}
}

// Run bun-sqlite benchmark (requires bun runtime)
try {
	console.log("Running bun-sqlite benchmark...");
	execSync(`bun benchmark/bun-sqlite.ts --output ${bunResultsPath}`, { cwd, stdio: "inherit" });
	const bunResults: BenchmarkResult = JSON.parse(readFileSync(bunResultsPath, "utf-8"));
	allResults.push(bunResults);
	unlinkSync(bunResultsPath);
} catch {
	console.warn("Skipping bun:sqlite benchmark (bun not available or failed)");
	try { unlinkSync(bunResultsPath); } catch {}
}

// Output combined results
if (allResults.length > 0) {
	console.log("");
	console.log(formatCombinedMarkdown(allResults));
	console.log("");
} else {
	console.error("No benchmark results collected.");
	process.exit(1);
}
