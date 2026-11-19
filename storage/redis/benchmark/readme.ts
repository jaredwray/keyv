import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { runBenchmarks } from "./utils.js";

const readmePath = new URL("../README.md", import.meta.url);
const startMarker = "<!-- BENCHMARK-RESULTS-START -->";
const endMarker = "<!-- BENCHMARK-RESULTS-END -->";

const table = await runBenchmarks();
const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker, start + startMarker.length);
if (start === -1 || end === -1) {
	throw new Error("The README does not contain the benchmark markers.");
}

const client = `The client used Node.js ${process.versions.node} on ${process.platform}/${process.arch}. Its CPU allocation was ${availableParallelism()}.`;
writeFileSync(
	readmePath,
	[readme.slice(0, start + startMarker.length), client, "", table, readme.slice(end)].join("\n"),
);
console.log(table);
