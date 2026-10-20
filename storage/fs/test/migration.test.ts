import path from "node:path";
import Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import { expect, test } from "vitest";
import KeyvFs from "../src/index.js";
import { tempDir } from "./helpers.js";

test("the README's keyv-file migration copies values and expiry", async () => {
	const directory = tempDir();
	const oldFile = path.join(directory, "keyv-file.json");

	// Data written by keyv-file through Keyv, as an app using it today would have.
	const writer = new Keyv({
		store: new KeyvFile({ filename: oldFile, writeDelay: 0 }),
		namespace: "cache",
	});
	await writer.set("forever", { a: 1 });
	await writer.set("soon", "expires", 60_000);
	await writer.disconnect();

	// The snippet from the README.
	const source = new Keyv({
		store: new KeyvFile({ filename: oldFile, writeDelay: 0 }),
		namespace: "cache",
	});
	const target = new Keyv({
		store: new KeyvFs(path.join(directory, "keyv.jsonl")),
		namespace: "cache",
	});
	for await (const [key] of source.iterator()) {
		const raw = await source.getRaw(key);
		if (raw) {
			await target.setRaw(key, raw);
		}
	}

	await target.disconnect();

	const migrated = new Keyv({
		store: new KeyvFs(path.join(directory, "keyv.jsonl")),
		namespace: "cache",
	});
	expect(await migrated.get("forever")).toEqual({ a: 1 });
	expect(await migrated.get("soon")).toBe("expires");
	const raw = await migrated.getRaw("soon");
	expect(raw?.expires).toBeGreaterThan(Date.now());
	await migrated.disconnect();
});
