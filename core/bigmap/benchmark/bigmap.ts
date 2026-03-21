import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { tinybenchPrinter } from "@monstermann/tinybench-pretty-printer";
import { Bench } from "tinybench";
import { BigMap } from "../dist/index.js";

const iterations = 10_000;
const bench = new Bench({ name: "BigMap vs Map", iterations });

const bigMap = new BigMap<string, string>();
const nativeMap = new Map<string, string>();

// Pre-generate test data so faker overhead doesn't affect benchmark timing
const testData = Array.from({ length: iterations }, () => ({
	key: faker.string.uuid(),
	value: faker.lorem.paragraph(),
}));

// --- set / get ---

let bigMapSetIndex = 0;
bench.add("BigMap set / get", () => {
	const { key, value } = testData[bigMapSetIndex % testData.length];
	bigMapSetIndex++;
	bigMap.set(key, value);
	bigMap.get(key);
});

let mapSetIndex = 0;
bench.add("Map set / get", () => {
	const { key, value } = testData[mapSetIndex % testData.length];
	mapSetIndex++;
	nativeMap.set(key, value);
	nativeMap.get(key);
});

await bench.run();

const markdown = tinybenchPrinter.toMarkdown(bench);
console.log(markdown);

// Update README.md with benchmark results
const startMarker = "<!-- BENCHMARK-RESULTS-START -->";
const endMarker = "<!-- BENCHMARK-RESULTS-END -->";
const readmePath = resolve(import.meta.dirname, "..", "README.md");
const readme = readFileSync(readmePath, "utf-8");

const startIndex = readme.indexOf(startMarker);
const endIndex = readme.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
	const updated = readme.slice(0, startIndex + startMarker.length) + "\n" + markdown + "\n" + readme.slice(endIndex);
	writeFileSync(readmePath, updated);
	console.log("\nREADME.md updated with benchmark results.");
} else {
	console.warn("\nCould not find benchmark markers in README.md, skipping update.");
}
