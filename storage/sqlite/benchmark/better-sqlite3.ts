import { faker } from "@faker-js/faker";
import { tinybenchPrinter } from "@monstermann/tinybench-pretty-printer";
import { Bench } from "tinybench";
import KeyvSqlite from "../src/index.js";

const bench = new Bench({ name: "better-sqlite3", iterations: 10_000 });
const store = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "better-sqlite3" });

// Warm up connection
await store.set("warmup", "warmup");
await store.get("warmup");
await store.clear();

bench.add("set", async () => {
	await store.set(faker.string.uuid(), faker.lorem.paragraph());
});

bench.add("get", async () => {
	const key = faker.string.uuid();
	await store.set(key, faker.lorem.paragraph());
	await store.get(key);
});

await bench.run();

console.log(tinybenchPrinter.toMarkdown(bench));
console.log("");

await store.disconnect();
