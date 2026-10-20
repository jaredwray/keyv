import path from "node:path";
import Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import { KeyvFs } from "../src/index.js";

export type Entry = { key: string; value: string };

/** A store under test, always used through `new Keyv({ store })` as an app would. */
export type BenchAdapter = {
	name: string;
	/** Runs only the write and cold-open scenarios, with fewer iterations. */
	slow?: boolean;
	/** Opens the store kept in `directory`. Opening twice reads what the first wrote. */
	open(directory: string): Keyv;
	/** Fills the store without timing it. */
	prepopulate(keyv: Keyv, entries: Entry[]): Promise<void>;
};

async function fillKeyvFs(keyv: Keyv, entries: Entry[]): Promise<void> {
	for (let start = 0; start < entries.length; start += 1000) {
		await keyv.setMany(entries.slice(start, start + 1000));
	}

	await (keyv.store as KeyvFs).flush();
}

/**
 * Fills a keyv-file store. Sets made in the same tick share one save, so this writes the file once
 * instead of once per entry. `keyv.setMany` would save once per entry: keyv-file has no
 * `setMany`, so Keyv's bridge sets the entries one at a time.
 */
async function fillKeyvFile(keyv: Keyv, entries: Entry[], chunk: number): Promise<void> {
	for (let start = 0; start < entries.length; start += chunk) {
		await Promise.all(
			entries.slice(start, start + chunk).map(({ key, value }) => keyv.set(key, value)),
		);
	}
}

export const adapters: BenchAdapter[] = [
	{
		name: "@keyv/fs file",
		open: (directory) => new Keyv({ store: new KeyvFs(path.join(directory, "store.jsonl")) }),
		prepopulate: fillKeyvFs,
	},
	{
		name: "@keyv/fs directory",
		open: (directory) =>
			new Keyv({
				store: new KeyvFs({ path: path.join(directory, "store"), strategy: "directory" }),
			}),
		prepopulate: fillKeyvFs,
	},
	{
		name: "keyv-file",
		open: (directory) =>
			new Keyv({
				store: new KeyvFile({ filename: path.join(directory, "store.json"), writeDelay: 0 }),
			}),
		prepopulate: (keyv, entries) => fillKeyvFile(keyv, entries, entries.length),
	},
	{
		name: "keyv-file separatedFile",
		open: (directory) =>
			new Keyv({
				store: new KeyvFile({
					filename: path.join(directory, "store"),
					separatedFile: true,
					writeDelay: 0,
				}),
			}),
		// One file per entry: in smaller chunks, to stay under the open-file limit.
		prepopulate: (keyv, entries) => fillKeyvFile(keyv, entries, 256),
	},
	{
		name: "keyv-file default writeDelay (100 ms)",
		slow: true,
		open: (directory) =>
			new Keyv({ store: new KeyvFile({ filename: path.join(directory, "store.json") }) }),
		prepopulate: (keyv, entries) => fillKeyvFile(keyv, entries, entries.length),
	},
];
