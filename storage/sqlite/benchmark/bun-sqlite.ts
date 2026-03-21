import { faker } from "@faker-js/faker";
import { Bench } from "tinybench";
import KeyvSqlite from "../src/index.js";
import { handleOutput } from "./utils.js";

const bench = new Bench({ name: "bun:sqlite", iterations: 10_000 });
const store = new KeyvSqlite({ uri: "sqlite://:memory:", driver: "bun:sqlite" });

// Warm up connection
await store.set("warmup", "warmup");
await store.get("warmup");
await store.clear();

// Pre-generate test data so faker overhead doesn't affect benchmark timing
const testData = Array.from({ length: 10_000 }, () => ({
	key: faker.string.uuid(),
	value: faker.lorem.paragraph(),
}));

let bunIndex = 0;
bench.add("bun set / get", async () => {
	const { key, value } = testData[bunIndex % testData.length];
	bunIndex++;
	await store.set(key, value);
	await store.get(key);
});

await bench.run();

handleOutput(bench);

await store.disconnect();
