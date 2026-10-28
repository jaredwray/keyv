import { mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import KeyvFs from "../src/index.js";
import { attach, detach, registryKey } from "../src/registry.js";
import type { Strategy } from "../src/strategies/strategy.js";
import { tempDir } from "./helpers.js";

function fakeBackend(close: () => Promise<void>): Strategy {
	return { close } as unknown as Strategy;
}

describe("registry", () => {
	test("instances on one path share a backend", async () => {
		for (const strategy of ["file", "directory"] as const) {
			const location = path.join(tempDir(), "store");
			const a = new KeyvFs({ path: location, strategy });
			const b = new KeyvFs({ path: location, strategy, namespace: "other" });
			await a.set("k", "from a");
			b.namespace = undefined;
			expect(await b.get("k")).toBe("from a");
			await a.disconnect();
			expect(await b.get("k")).toBe("from a");
			await b.disconnect();
		}
	});

	test("a different strategy or delay on an open path throws", () => {
		const location = path.join(tempDir(), "store");
		const open = new KeyvFs(location);
		expect(() => new KeyvFs(location, { strategy: "directory" })).toThrow(/different options/);
		expect(() => new KeyvFs(location, { writeDelay: 5 })).toThrow(/different options/);
		expect(() => new KeyvFs(location, { expiredCheckDelay: 5 })).toThrow(/different options/);
		expect(new KeyvFs(location, { namespace: "ns" }).path).toBe(open.path);
	});

	test("relative, absolute and symlinked spellings share a backend", async () => {
		const directory = tempDir();
		const real = path.join(directory, "real");
		mkdirSync(real);
		const link = path.join(directory, "link");
		symlinkSync(real, link);

		const absolute = new KeyvFs(path.join(real, "store.jsonl"));
		const relative = new KeyvFs(path.relative(process.cwd(), path.join(real, "store.jsonl")));
		const linked = new KeyvFs(path.join(link, "store.jsonl"));
		await absolute.set("k", "v");
		expect(await relative.get("k")).toBe("v");
		expect(await linked.get("k")).toBe("v");
		expect(linked.path).toBe(absolute.path);
	});

	test("paths that don't exist yet resolve through their nearest existing ancestor", () => {
		const directory = tempDir();
		const real = path.join(directory, "real");
		mkdirSync(real);
		const link = path.join(directory, "link");
		symlinkSync(real, link);
		const missing = path.join("missing", "deeper", "store.jsonl");
		expect(registryKey(path.join(link, missing))).toBe(path.join(real, missing));
		expect(registryKey(path.join(real, missing))).toBe(path.join(real, missing));
		const viaLink = new KeyvFs(path.join(link, missing));
		const viaReal = new KeyvFs(path.join(real, missing));
		expect(viaLink.path).toBe(viaReal.path);
	});

	test("the last detach closes the backend, and a reopen waits for the close", async () => {
		let finishClose!: () => void;
		const close = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishClose = resolve;
				}),
		);
		const first = fakeBackend(close);
		const key = path.join(tempDir(), "fake");
		expect(attach(key, "x", () => first)).toBe(first);
		expect(attach(key, "x", () => fakeBackend(close))).toBe(first);

		await detach(key, first);
		expect(close).not.toHaveBeenCalled();
		const closing = detach(key, first);
		expect(close).toHaveBeenCalledTimes(1);

		const create = vi.fn((previousClose?: Promise<void>) => {
			expect(previousClose).toBe(closing);
			return fakeBackend(async () => {});
		});
		const second = attach(key, "x", create);
		expect(create).toHaveBeenCalledTimes(1);
		finishClose();
		await closing;

		// Detaching a backend that is not the registered one does nothing.
		await detach(
			key,
			fakeBackend(async () => {}),
		);
		const closingSecond = detach(key, second);
		attach(key, "x", (previousClose) => {
			expect(previousClose).toBe(closingSecond);
			return fakeBackend(async () => {});
		});
		await closingSecond;
	});

	test("a failed close is still forgotten", async () => {
		const backend = fakeBackend(() => Promise.reject(new Error("close failed")));
		const key = path.join(tempDir(), "fake");
		attach(key, "x", () => backend);
		await expect(detach(key, backend)).rejects.toThrow("close failed");
		await new Promise((resolve) => setImmediate(resolve));
		attach(key, "x", (previousClose) => {
			expect(previousClose).toBeUndefined();
			return fakeBackend(async () => {});
		});
	});

	test("an older close finishing late leaves a newer close in place", async () => {
		const key = path.join(tempDir(), "fake");
		let finishFirst!: () => void;
		const first = fakeBackend(
			() =>
				new Promise<void>((resolve) => {
					finishFirst = resolve;
				}),
		);
		attach(key, "x", () => first);
		const firstClosing = detach(key, first);

		let finishSecond!: () => void;
		const second = fakeBackend(
			() =>
				new Promise<void>((resolve) => {
					finishSecond = resolve;
				}),
		);
		attach(key, "x", () => second);
		const secondClosing = detach(key, second);
		finishFirst();
		await firstClosing;
		attach(key, "x", (previousClose) => {
			expect(previousClose).toBe(secondClosing);
			return fakeBackend(async () => {});
		});
		finishSecond();
		await secondClosing;
	});
});

test("a store opened while earlier ones close waits for every earlier close", async () => {
	const { FileStrategy } = await import("../src/strategies/file.js");
	const file = path.join(tempDir(), "store.jsonl");
	const key = registryKey(file);
	let finishFirst!: () => void;
	const first = fakeBackend(
		() =>
			new Promise<void>((resolve) => {
				finishFirst = resolve;
			}),
	);
	attach(key, "x", () => first);
	const firstClosing = detach(key, first);

	// A backend that never loads closes on the heels of the first.
	const second = attach(
		key,
		"x",
		(previousClose) => new FileStrategy(file, 0, 1000, previousClose),
	);
	const secondClosing = detach(key, second);

	let thirdLoaded = false;
	const third = attach(key, "x", (previousClose) => new FileStrategy(file, 0, 1000, previousClose));
	const loading = third.load().then(() => {
		thirdLoaded = true;
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(thirdLoaded).toBe(false);
	finishFirst();
	await Promise.all([firstClosing, secondClosing, loading]);
	expect(thirdLoaded).toBe(true);
	await detach(key, third);
});
