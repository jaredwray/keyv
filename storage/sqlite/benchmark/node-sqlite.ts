import { faker } from "@faker-js/faker";
import sqlite3 from "sqlite3";
import { Bench } from "tinybench";
import KeyvSqlite, { createSqlite3Driver } from "../src/index.js";
import { handleOutput } from "./utils.js";

const bench = new Bench({ name: "node, better & sqlite3", iterations: 10_000 });
const storeNode = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "node:sqlite" });
const storeBetter = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "better-sqlite3" });
const storeSqlite3 = new KeyvSqlite({
	uri: "sqlite://:memory:",
	driver: createSqlite3Driver(sqlite3),
});

// Warm up connection
await storeNode.set("warmup", "warmup");
await storeNode.get("warmup");
await storeNode.clear();
await storeBetter.set("warmup", "warmup");
await storeBetter.get("warmup");
await storeBetter.clear();
await storeSqlite3.set("warmup", "warmup");
await storeSqlite3.get("warmup");
await storeSqlite3.clear();

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

let sqlite3Index = 0;
bench.add("sqlite3 set / get", async () => {
	const { key, value } = testData[sqlite3Index % testData.length];
	sqlite3Index++;
	await storeSqlite3.set(key, value);
	await storeSqlite3.get(key);
});

await bench.run();

handleOutput(bench);

await storeNode.disconnect();
await storeBetter.disconnect();
await storeSqlite3.disconnect();
