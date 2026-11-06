// Benchmarks every adapter at one store size and writes the results as JSON (--output) or prints
// them. combined.ts runs this once per size, each in its own process.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { faker } from "@faker-js/faker";
import type Keyv from "keyv";
import { Bench } from "tinybench";
import { adapters, type BenchAdapter, type Entry } from "./adapters.js";
import {
	type AdapterResult,
	argument,
	environment,
	extractTasks,
	footprint,
	formatMarkdown,
} from "./utils.js";

const size = Number(argument("--size") ?? 1000);
const only = argument("--adapter");

// Data is generated before timing, so faker's cost isn't measured.
const entries: Entry[] = Array.from({ length: size }, () => ({
	key: faker.string.uuid(),
	value: faker.lorem.paragraph(),
}));
let cursor = 0;
const nextEntry = (): Entry => {
	cursor = (cursor + 7919) % entries.length;
	return entries[cursor];
};

const nextBatch = (count: number): Entry[] => Array.from({ length: count }, nextEntry);

async function verify(keyv: Keyv, adapter: BenchAdapter): Promise<void> {
	for (let index = 0; index < 100; index++) {
		const { key } = entries[Math.floor(Math.random() * entries.length)];
		if ((await keyv.get(key)) === undefined) {
			throw new Error(`${adapter.name}: prepopulated key ${key} is missing after reopening`);
		}
	}
}

async function benchmark(adapter: BenchAdapter): Promise<AdapterResult> {
	const directory = mkdtempSync(path.join(tmpdir(), "keyv-fs-bench-"));
	try {
		const filling = adapter.open(directory);
		await adapter.prepopulate(filling, entries);
		await filling.disconnect();

		let keyv = adapter.open(directory);
		await verify(keyv, adapter);
		const disk = footprint(directory);

		const options = adapter.slow ? { time: 200, iterations: 10 } : { time: 1000, iterations: 64 };
		const warm = new Bench({ name: adapter.name, ...options });
		warm.add("set (overwrite)", async () => {
			const { key, value } = nextEntry();
			await keyv.set(key, value);
		});
		if (!adapter.slow) {
			warm.add("get (hit)", async () => {
				await keyv.get(nextEntry().key);
			});
			warm.add("get (miss)", async () => {
				await keyv.get(faker.string.uuid());
			});
			warm.add("set + get", async () => {
				const { key, value } = nextEntry();
				await keyv.set(key, value);
				await keyv.get(key);
			});
			warm.add("getMany (100 keys)", async () => {
				await keyv.getMany(nextBatch(100).map((entry) => entry.key));
			});
			warm.add("setMany (100 keys)", async () => {
				await keyv.setMany(nextBatch(100));
			});
			warm.add("delete + set", async () => {
				const { key, value } = nextEntry();
				await keyv.delete(key);
				await keyv.set(key, value);
			});
		}

		warm.add("100 concurrent sets", async () => {
			await Promise.all(nextBatch(100).map(({ key, value }) => keyv.set(key, value)));
		});
		await warm.run();
		await keyv.disconnect();

		// Every iteration opens the store from disk and reads one key. No other instance is open,
		// so @keyv/fs can't reuse a loaded store.
		const cold = new Bench({ name: adapter.name, ...options });
		cold.add(
			"open + first get",
			async () => {
				keyv = adapter.open(directory);
				await keyv.get(nextEntry().key);
			},
			{
				afterEach: async () => {
					await keyv.disconnect();
				},
			},
		);
		await cold.run();

		return {
			adapter: adapter.name,
			...disk,
			tasks: [...extractTasks(warm), ...extractTasks(cold)],
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

const results: AdapterResult[] = [];
for (const adapter of adapters) {
	if (only !== undefined && adapter.name !== only) {
		continue;
	}

	console.error(`Benchmarking ${adapter.name} with ${size.toLocaleString("en-US")} entries...`);
	results.push(await benchmark(adapter));
}

const output = argument("--output");
if (output) {
	writeFileSync(output, JSON.stringify({ size, adapters: results }, null, 2));
} else {
	console.log(formatMarkdown([{ size, adapters: results }], environment()));
}
