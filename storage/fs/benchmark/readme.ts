// Runs the benchmark and writes the tables into README.md between the benchmark markers.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runAll } from "./combined.js";
import { environment, formatMarkdown } from "./utils.js";

const readmePath = path.join(import.meta.dirname, "..", "README.md");
const startMarker = "<!-- BENCHMARK-RESULTS-START -->";
const endMarker = "<!-- BENCHMARK-RESULTS-END -->";

const table = formatMarkdown(runAll(), environment());
const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);
if (start === -1 || end === -1) {
	console.error("Could not find the benchmark markers in README.md");
	process.exit(1);
}

writeFileSync(
	readmePath,
	`${readme.slice(0, start + startMarker.length)}\n${table}\n${readme.slice(end)}`,
);
console.log(table);
