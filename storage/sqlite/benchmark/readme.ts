import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCombinedMarkdown, runBenchmarks } from "./utils.js";

const readmePath = resolve(import.meta.dirname, "..", "README.md");
const startMarker = "<!-- BENCHMARK-RESULTS-START -->";
const endMarker = "<!-- BENCHMARK-RESULTS-END -->";

const allResults = runBenchmarks();

if (allResults.length === 0) {
	console.error("No benchmark results collected.");
	process.exit(1);
}

const table = formatCombinedMarkdown(allResults);
const readme = readFileSync(readmePath, "utf-8");

const startIndex = readme.indexOf(startMarker);
const endIndex = readme.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
	console.error("Could not find benchmark markers in README.md");
	process.exit(1);
}

const updated = readme.slice(0, startIndex + startMarker.length) + "\n" + table + "\n" + readme.slice(endIndex);
writeFileSync(readmePath, updated);

console.log("");
console.log("README.md updated with benchmark results:");
console.log("");
console.log(table);
console.log("");
