import { faker } from "@faker-js/faker";
import { afterAll, describe, expect, it } from "vitest";
import KeyvCloudflareKV from "../../src/index.js";

// Live integration test against the real Cloudflare KV REST API. It is skipped unless all three
// credentials are present, so it is a no-op locally and on forks. The scheduled
// `cloudflare-kv-live` GitHub workflow provides them from repository secrets.
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

	it("sets, gets, checks, and deletes a value", async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.sentence();

		expect(await store.set(key, value)).toBe(true);
		expect(await store.get(key)).toBe(value);
		expect(await store.has(key)).toBe(true);

		expect(await store.delete(key)).toBe(true);
		expect(await store.get(key)).toBeUndefined();
		expect(await store.has(key)).toBe(false);
	});

	it("stores a value with a TTL and serves it before expiry", async () => {
		const key = faker.string.uuid();
		const value = faker.lorem.word();

		await store.set(key, value, Date.now() + 5 * 60 * 1000);
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
