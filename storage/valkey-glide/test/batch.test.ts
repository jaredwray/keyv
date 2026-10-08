import process from "node:process";
import { faker } from "@faker-js/faker";
import { RequestError } from "@valkey/valkey-glide";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import KeyvValkeyGlide from "../src/index.js";

describe.each([false, true])("batch command failures (cluster: %s)", (cluster) => {
	let store: KeyvValkeyGlide;
	let onError: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		store = new KeyvValkeyGlide(
			cluster
				? { cluster: true, addresses: [{ host: "127.0.0.1", port: 7201 }] }
				: (process.env.VALKEY_URI ?? "redis://localhost:6371"),
			{ namespace: faker.string.alphanumeric(12) },
		);
		onError = vi.fn();
		store.on("error", onError);
		await store.getClient();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await store.disconnect();
	});

	test.each([false, true])(
		"reports rejected SETs in input order (useSets: %s)",
		async (useSets) => {
			store.useSets = useSets;
			expect(
				await store.setMany([
					{ key: "before", value: "first" },
					{ key: "skipped", value: undefined },
					{ key: "invalid", value: "rejected", expires: 0 },
					{ key: "after", value: "last" },
				]),
			).toEqual([true, false, false, true]);
			expect(await store.getMany(["before", "skipped", "invalid", "after"])).toEqual([
				"first",
				undefined,
				undefined,
				"last",
			]);
			expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(RequestError));
		},
	);

	test("reports failed SADD and SREM commands even when the data commands succeed", async () => {
		store.useSets = true;
		await store.client.set(`sets:${store.namespace}`, "not a set");
		expect(await store.setMany([{ key: "key", value: "value" }])).toEqual([false]);
		expect(await store.get("key")).toBe("value");
		expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(RequestError));

		onError.mockClear();
		expect(await store.deleteMany(["key"])).toEqual([false]);
		expect(await store.get("key")).toBeUndefined();
		expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(RequestError));
		await store.client.unlink([`sets:${store.namespace}`]);
	});

	test("accepts zero from successful tracking commands", async () => {
		store.useSets = true;
		expect(await store.setMany([{ key: "key", value: "first" }])).toEqual([true]);
		expect(await store.setMany([{ key: "key", value: "updated" }])).toEqual([true]);
		await store.client.unlink([`sets:${store.namespace}`]);
		expect(await store.deleteMany(["key"])).toEqual([true]);
		expect(onError).not.toHaveBeenCalled();
	});

	test("preserves partial success when tracking fails for one entry", async () => {
		store.useSets = true;
		const failure = new RequestError("SADD failed");
		vi.spyOn(store.client, "exec").mockResolvedValue(["OK", 1, "OK", failure, "OK", 0]);
		expect(
			await store.setMany([
				{ key: "first", value: "value" },
				{ key: "skipped", value: undefined },
				{ key: "failed", value: "value" },
				{ key: "last", value: "value" },
			]),
		).toEqual([true, false, false, true]);
		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
	});

	test("reports all command failures in a single error event", async () => {
		store.useSets = true;
		const failures = [new RequestError("SET failed"), new RequestError("SADD failed")];
		vi.spyOn(store.client, "exec").mockResolvedValue([failures[0], failures[1], "OK", 1]);
		expect(
			await store.setMany([
				{ key: "failed", value: "value" },
				{ key: "successful", value: "value" },
			]),
		).toEqual([false, true]);
		expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(AggregateError));
		expect(onError.mock.calls[0][0].errors).toEqual(failures);
	});

	test("does not emit again if an error listener throws", async () => {
		const failure = new RequestError("SET failed");
		vi.spyOn(store.client, "exec").mockResolvedValue([failure]);
		onError.mockImplementation(() => {
			throw failure;
		});
		await expect(store.setMany([{ key: "key", value: "value" }])).rejects.toBe(failure);
		expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
	});

	test.each(["deleteMany", "hasMany"] as const)(
		"%s reports per-command failures",
		async (method) => {
			const failure = new RequestError("command failed");
			vi.spyOn(store.client, "exec").mockResolvedValue([1, failure, 0, 1]);
			expect(await store[method](["first", "failed", "missing", "last"])).toEqual([
				true,
				false,
				false,
				true,
			]);
			expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
		},
	);

	test("deleteMany checks both UNLINK and SREM for each entry", async () => {
		store.useSets = true;
		const failures = [new RequestError("UNLINK failed"), new RequestError("SREM failed")];
		vi.spyOn(store.client, "exec").mockResolvedValue([1, failures[0], 1, 1, 1, 0, failures[1], 0]);
		expect(await store.deleteMany(["first", "unlink-failed", "srem-failed", "last"])).toEqual([
			true,
			false,
			false,
			true,
		]);
		expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(AggregateError));
		expect(onError.mock.calls[0][0].errors).toEqual(failures);
	});

	test("does not report success when a batch returns no results", async () => {
		vi.spyOn(store.client, "exec").mockResolvedValue(null);
		expect(await store.setMany([{ key: "key", value: "value" }])).toEqual([false]);
		expect(await store.deleteMany(["key"])).toEqual([false]);
		expect(await store.hasMany(["key"])).toEqual([false]);
	});
});
