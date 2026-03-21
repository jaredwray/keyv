import { faker } from "@faker-js/faker";
import { tinybenchPrinter } from "@monstermann/tinybench-pretty-printer";
import { Bench } from "tinybench";
import KeyvSqlite from "../src/index.js";

const bench = new Bench({ name: "bun:sqlite", iterations: 10_000 });
const store = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "bun:sqlite" });

// Warm up connection
await store.set("warmup", "warmup");
await store.get("warmup");
await store.clear();

bench.add("bun set / get", async () => {
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.paragraph());
	await store.get(key);
});

await bench.run();

console.log(tinybenchPrinter.toMarkdown(bench));
console.log("");

await store.disconnect();
