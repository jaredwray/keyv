import { faker } from "@faker-js/faker";
import { Bench } from "tinybench";
import KeyvSqlite from "../src/index.js";
import { handleOutput } from "./utils.js";

const bench = new Bench({ name: "node & better", iterations: 10_000 });
const storeNode = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "node:sqlite" });
const storeBetter = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "better-sqlite3" });

// Warm up connection
await storeNode.set("warmup", "warmup");
await storeNode.get("warmup");
await storeNode.clear();
await storeBetter.set("warmup", "warmup");
await storeBetter.get("warmup");
await storeBetter.clear();

// Pre-generate test data so faker overhead doesn't affect benchmark timing
const testData = Array.from({ length: 10_000 }, () => ({
	key: faker.string.uuid(),
	value: faker.lorem.paragraph(),
}));

let nodeIndex = 0;
bench.add("node set / get", async () => {
	const { key, value } = testData[nodeIndex % testData.length];
	nodeIndex++;
	await storeNode.set(key, value);
	await storeNode.get(key);
});

let betterIndex = 0;
bench.add("better set / get", async () => {
	const { key, value } = testData[betterIndex % testData.length];
	betterIndex++;
	await storeBetter.set(key, value);
	await storeBetter.get(key);
});

await bench.run();

handleOutput(bench);

await storeNode.disconnect();
await storeBetter.disconnect();
