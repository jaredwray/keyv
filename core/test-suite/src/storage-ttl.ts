import { faker } from "@faker-js/faker";
import { delay } from "./helper.js";
import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Registers TTL expiration tests directly on the storage adapter: set with TTL,
 * has after expiry, and setMany with per-entry TTL. Skipped if `options.ttl` is `false`.
 * Set `options.ttlGranularity` to "seconds" for backends that only support
 * second-level TTLs (e.g. etcd leases, DynamoDB TTL) so second-scale values are used.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param store - Factory that returns a fresh {@link KeyvStorageAdapter} instance
 * @param options - Test configuration (missingValue, ttlGranularity, toggle flags)
 */
const storageTtlTests = (test: TestFunction, store: StorageFn, options?: StorageTestOptions) => {
	/* v8 ignore next 3 -- @preserve */
	if (options?.ttl === false) {
		return;
	}

	const missingValue = options?.missingValue;
	const seconds = options?.ttlGranularity === "seconds";
	const ttl = seconds ? 1000 : 100;
	const expiryDelay = seconds ? 3000 : 200;

	test("set(key, value, ttl) expires after TTL", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.word();
		await s.set(key, value, ttl);
		t.expect(await s.get(key)).toBe(value);
		await delay(expiryDelay);
		t.expect(await s.get(key)).toBe(missingValue);
	});

	test("has(key) returns false for expired key", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		await s.set(key, faker.lorem.word(), ttl);
		await delay(expiryDelay);
		t.expect(await s.has(key)).toBe(false);
	});

	test("setMany with per-entry TTL expires individual entries", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await s.setMany([
			{ key: key1, value: val1, ttl },
			{ key: key2, value: val2 },
		]);
		t.expect(await s.get(key1)).toBe(val1);
		t.expect(await s.get(key2)).toBe(val2);
		await delay(expiryDelay);
		t.expect(await s.get(key1)).toBe(missingValue);
		t.expect(await s.get(key2)).toBe(val2);
	});
};

export { storageTtlTests };
