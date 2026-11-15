import type { RedisClientType } from "@redis/client";
import { describe, expect, test } from "vitest";
import KeyvRedis from "../src/index.js";

type FakeScanResult = { cursor: number; keys: string[] };

function createFakeClient(
	scan: () => Promise<FakeScanResult>,
	unlink: (keys: string[]) => Promise<number>,
) {
	const client = {
		isReady: true,
		isOpen: true,
		scan,
		unlink,
		del: unlink,
		on() {
			return client;
		},
		removeListener() {
			return client;
		},
	};

	return client;
}

async function createAdapter(client: ReturnType<typeof createFakeClient>, throwOnErrors = false) {
	const adapter = new KeyvRedis(undefined, { namespace: "ns", throwOnErrors });
	adapter.client = client as unknown as RedisClientType;

	const errors: unknown[] = [];
	adapter.on("error", (error: unknown) => {
		errors.push(error);
	});

	return { adapter, errors };
}

describe("clear()", () => {
	test("waits for the failed batch instead of leaving its rejection unhandled", async () => {
		const batchError = new Error("NOPERM this user has no permissions to run the 'unlink' command");
		let scans = 0;
		const client = createFakeClient(
			async () => {
				scans += 1;
				if (scans === 1) {
					return { cursor: 1, keys: ["ns::a"] };
				}

				// Keep the next SCAN in flight while the first batch rejects.
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { cursor: 0, keys: ["ns::b"] };
			},
			async () => {
				throw batchError;
			},
		);
		const { adapter, errors } = await createAdapter(client);

		await expect(adapter.clear()).resolves.toBeUndefined();

		expect(errors).toEqual([batchError]);
	});

	test.each([false, true])(
		"waits for a pending delete after SCAN fails with throwOnErrors=%s",
		async (throwOnErrors) => {
			const scanError = new Error("SCAN failed");
			const batchError = new Error("UNLINK failed");
			let finishDelete!: () => void;
			const deleteGate = new Promise<void>((resolve) => {
				finishDelete = resolve;
			});
			let markScanFailed!: () => void;
			const scanFailed = new Promise<void>((resolve) => {
				markScanFailed = resolve;
			});
			let scans = 0;
			const client = createFakeClient(
				async () => {
					scans += 1;
					if (scans === 1) {
						return { cursor: 1, keys: ["ns::a"] };
					}

					markScanFailed();
					throw scanError;
				},
				async () => {
					await deleteGate;
					throw batchError;
				},
			);
			const { adapter, errors } = await createAdapter(client, throwOnErrors);
			let clearSettled = false;
			const result = adapter.clear().then(
				() => {
					clearSettled = true;
				},
				(error: unknown) => {
					clearSettled = true;
					return error;
				},
			);

			try {
				await scanFailed;
				await new Promise<void>((resolve) => setImmediate(resolve));
				expect(clearSettled).toBe(false);
				expect(errors).toEqual([]);
			} finally {
				finishDelete();
			}

			expect(await result).toBe(throwOnErrors ? scanError : undefined);
			expect(errors).toEqual(throwOnErrors ? [] : [scanError]);
		},
	);

	test("rejects with the batch error when throwOnErrors is true", async () => {
		const batchError = new Error("NOPERM this user has no permissions to run the 'unlink' command");
		let scans = 0;
		const client = createFakeClient(
			async () => {
				scans += 1;
				if (scans === 1) {
					return { cursor: 1, keys: ["ns::a"] };
				}

				await new Promise((resolve) => setImmediate(resolve));
				return { cursor: 0, keys: ["ns::b"] };
			},
			async () => {
				await new Promise((resolve) => setImmediate(resolve));
				throw batchError;
			},
		);
		const adapter = new KeyvRedis(undefined, { namespace: "ns", throwOnErrors: true });
		adapter.client = client as unknown as RedisClientType;

		await expect(adapter.clear()).rejects.toThrow(batchError);
	});

	test("deletes every matching key across SCAN batches", async () => {
		const unlinked: string[][] = [];
		let scans = 0;
		const client = createFakeClient(
			async () => {
				scans += 1;
				if (scans === 1) {
					return { cursor: 1, keys: ["ns::a", "other::key"] };
				}

				return { cursor: 0, keys: ["ns::b"] };
			},
			async (keys) => {
				unlinked.push(keys);
				return keys.length;
			},
		);
		const { adapter, errors } = await createAdapter(client);

		await expect(adapter.clear()).resolves.toBeUndefined();

		expect(unlinked).toEqual([["ns::a"], ["ns::b"]]);
		expect(errors).toEqual([]);
	});
});
