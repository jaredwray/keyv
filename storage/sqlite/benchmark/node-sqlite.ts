import { faker } from "@faker-js/faker";
import { tinybenchPrinter } from "@monstermann/tinybench-pretty-printer";
import { Bench } from "tinybench";
import KeyvSqlite from "../src/index.js";

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

bench.add("node set / get", async () => {
	const key = faker.string.uuid();
	await storeNode.set(key, faker.lorem.paragraph());
	await storeNode.get(key);
});

bench.add("better set / get", async () => {
	const key = faker.string.uuid();
	await storeBetter.set(key, faker.lorem.paragraph());
	await storeBetter.get(key);
});

await bench.run();

console.log(tinybenchPrinter.toMarkdown(bench));
console.log("");

await storeNode.disconnect();
