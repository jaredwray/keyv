import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import KeyvFs from "../src/index.js";
import { freshLocation, strategies } from "./helpers.js";

const writer = path.join(import.meta.dirname, "fixtures", "crash-writer.ts");

describe.each(strategies)("%s strategy", (strategy) => {
	test("every write acknowledged before a crash is on disk afterwards", async () => {
		const location = freshLocation(strategy);
		const child = spawn(process.execPath, ["--import", "tsx", writer, location, strategy], {
			stdio: ["ignore", "inherit", "inherit", "ipc"],
		});
		let acknowledged = -1;
		const exited = new Promise<void>((resolve) => {
			child.on("exit", () => {
				resolve();
			});
		});
		await new Promise<void>((resolve, reject) => {
			child.on("error", reject);
			child.on("message", (index: number) => {
				acknowledged = index;
				if (index === 200) {
					child.kill("SIGKILL");
					resolve();
				}
			});
		});
		await exited;

		const store = new KeyvFs({ path: location, strategy });
		const keys = Array.from({ length: acknowledged + 1 }, (_, index) => `key-${index}`);
		const values = await store.getMany(keys);
		expect(values.every((value, index) => value === `value-${index}-${"x".repeat(200)}`)).toBe(
			true,
		);
		await store.disconnect();
	}, 30_000);
});
