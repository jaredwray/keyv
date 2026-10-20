import { realpathSync } from "node:fs";
import path from "node:path";
import Keyv from "keyv";
import { describe, expect, test } from "vitest";
import KeyvFs, { createKeyv } from "../src/index.js";
import type { KeyvFsOptions } from "../src/types.js";
import { tempDir } from "./helpers.js";

describe("options", () => {
	test("path is required", () => {
		expect(() => new KeyvFs("")).toThrow(TypeError);
		expect(() => new KeyvFs({} as KeyvFsOptions)).toThrow(TypeError);
		expect(() => new KeyvFs({ path: 1 } as unknown as KeyvFsOptions)).toThrow(TypeError);
	});

	test("defaults", () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		expect(store.path).toBe(file);
		expect(store.strategy).toBe("file");
		expect(store.writeDelay).toBe(0);
		expect(store.expiredCheckDelay).toBe(86_400_000);
		expect(store.namespace).toBeUndefined();
		expect(store.capabilities.expires).toBe(true);
	});

	test("a relative path is resolved", () => {
		const store = new KeyvFs({ path: "relative-keyv-fs-test.jsonl", strategy: "file" });
		expect(store.path).toBe(
			path.join(realpathSync.native(process.cwd()), "relative-keyv-fs-test.jsonl"),
		);
	});

	test("options can follow the path, or include it", () => {
		const directory = path.join(tempDir(), "store");
		const a = new KeyvFs(directory, {
			strategy: "directory",
			namespace: "ns",
			expiredCheckDelay: 5,
		});
		expect(a.strategy).toBe("directory");
		expect(a.namespace).toBe("ns");
		expect(a.expiredCheckDelay).toBe(5);

		const b = new KeyvFs({ path: directory, strategy: "directory", expiredCheckDelay: 5 });
		expect(b.strategy).toBe("directory");
		expect(b.namespace).toBeUndefined();
	});

	test("invalid options throw a TypeError", () => {
		const file = path.join(tempDir(), "store.jsonl");
		const invalid: Array<Partial<KeyvFsOptions> & Record<string, unknown>> = [
			{ strategy: "log" as never },
			{ writeDelay: -1 },
			{ writeDelay: Number.NaN },
			{ writeDelay: "5" as never },
			{ expiredCheckDelay: -1 },
			{ namespace: 5 as never },
		];
		for (const options of invalid) {
			expect(() => new KeyvFs({ path: file, ...options }), JSON.stringify(options)).toThrow(
				TypeError,
			);
		}
	});

	test("an endless writeDelay is clamped to the longest timer", () => {
		const store = new KeyvFs(path.join(tempDir(), "store.jsonl"), {
			writeDelay: Number.POSITIVE_INFINITY,
			expiredCheckDelay: Number.POSITIVE_INFINITY,
		});
		expect(store.writeDelay).toBe(2_147_483_647);
		expect(store.expiredCheckDelay).toBe(Number.POSITIVE_INFINITY);
	});

	test("the namespace can be changed, and an empty one means none", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const store = new KeyvFs(file);
		store.namespace = "ns";
		expect(store.namespace).toBe("ns");
		store.namespace = "";
		expect(store.namespace).toBe("");
		await store.set("k", "v");
		store.namespace = undefined;
		expect(await store.get("k")).toBe("v");
		await store.disconnect();
	});

	test("Keyv uses the adapter directly", () => {
		const store = new KeyvFs(path.join(tempDir(), "store.jsonl"));
		const keyv = new Keyv({ store });
		expect(keyv.store).toBe(store);
	});
});

describe("createKeyv", () => {
	test("takes a path and options", async () => {
		const file = path.join(tempDir(), "store.jsonl");
		const keyv = createKeyv(file, { namespace: "app" });
		expect(keyv.store).toBeInstanceOf(KeyvFs);
		expect(keyv.namespace).toBe("app");
		await keyv.set("a", { b: 1 });
		expect(await keyv.get("a")).toEqual({ b: 1 });
		await keyv.disconnect();
	});

	test("takes an options object", async () => {
		const directory = path.join(tempDir(), "store");
		const keyv = createKeyv({ path: directory, strategy: "directory" });
		expect((keyv.store as KeyvFs).strategy).toBe("directory");
		await keyv.set("a", 1);
		expect(await keyv.get("a")).toBe(1);
		await keyv.disconnect();
	});
});
