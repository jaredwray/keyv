import { faker } from "@faker-js/faker";
import { afterAll, describe, expect, it, vi } from "vitest";
import KeyvCloudflareKV from "../../src/index.js";

// Live integration test against the real Cloudflare KV REST API. It is skipped unless all three
// credentials are present, so it is a no-op locally and on forks. The
// `cloudflare-keyv-integration` GitHub workflow maps repository secret
// CLOUDFLARE_API_TOKEN_KV_TESTS onto CLOUDFLARE_API_TOKEN.
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const hasCredentials = Boolean(accountId && namespaceId && apiToken);

describe.skipIf(!hasCredentials)("Cloudflare KV live integration (REST)", () => {
	// Isolate this run under a unique namespace so it never touches unrelated keys, and so cleanup
	// only removes what this run created. Constructed lazily because the describe body is still
	// evaluated when skipped, and the REST client requires real credentials at construction.
	const store = hasCredentials
		? new KeyvCloudflareKV({
				mode: "rest",
				accountId,
				namespaceId,
				apiToken,
				namespace: `keyv-live-test:${faker.string.uuid()}`,
			})
		: (undefined as unknown as KeyvCloudflareKV);

	afterAll(async () => {
		await store.clear();
	});

	it("sets, gets, checks, and deletes a value", { timeout: 90_000 }, async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();

		expect(await store.set(key, value)).toBe(true);
		expect(await store.get(key)).toBe(value);
		expect(await store.has(key)).toBe(true);

		expect(await store.delete(key)).toBe(true);
		// KV caches reads for 60 seconds by default, and the reads above (plus the one delete()
		// makes to report whether the key existed) can leave the value cached. So wait for the
		// delete to become visible instead of expecting it on the very next read.
		await vi.waitFor(
			async () => {
				expect(await store.get(key)).toBeUndefined();
				expect(await store.has(key)).toBe(false);
			},
			{ timeout: 75_000, interval: 2_000 },
		);
	});

	it("handles batch set, get, has, and delete", async () => {
		const key1 = faker.string.uuid();
		const key2 = faker.string.uuid();
		const missing = faker.string.uuid();

		expect(
			await store.setMany([
				{ key: key1, value: "one" },
				{ key: key2, value: "two" },
			]),
		).toEqual([true, true]);
		expect(await store.getMany([key1, key2, missing])).toEqual(["one", "two", undefined]);
		expect(await store.hasMany([key1, key2, missing])).toEqual([true, true, false]);
		expect(await store.deleteMany([key1, key2])).toEqual([true, true]);
	});

	it("stores a value with a TTL and serves it before expiry", async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await store.set(key, value, Date.now() + 5 * 60 * 1000);
		expect(await store.get(key)).toBe(value);

		await store.delete(key);
	});

	it("stores a value with a TTL under KV's 60-second minimum", async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		expect(await store.set(key, value, Date.now() + 5000)).toBe(true);
		expect(await store.get(key)).toBe(value);

		await store.delete(key);
	});

	it("iterates over namespaced keys", async () => {
		const key = faker.string.uuid();
		await store.set(key, "iterated");

		const found: string[] = [];
		for await (const [k] of store.iterator()) {
			found.push(k as string);
		}
		expect(found).toContain(key);

		await store.delete(key);
	});
});
