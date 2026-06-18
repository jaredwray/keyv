import { faker } from "@faker-js/faker";
import { delay } from "./helper.js";
import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Registers expiry tests directly on the storage adapter: set with an absolute
 * `expires`, has after expiry, and setMany with per-entry `expires`. Skipped if
 * `options.ttl` is `false`. Set `options.ttlGranularity` to "seconds" for backends
 * that only support second-level expiry (e.g. etcd leases, DynamoDB TTL) so
 * second-scale deadlines are used.
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
	// The storage contract takes an absolute expiry (ms since epoch), not a relative ttl.
	const expiresIn = (ms: number) => Date.now() + ms;

	test("set(key, value, expires) expires after the deadline", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.word();
		await s.set(key, value, expiresIn(ttl));
		t.expect(await s.get(key)).toBe(value);
		await delay(expiryDelay);
		t.expect(await s.get(key)).toBe(missingValue);
	});

	test("set(key, value, expires) with an already-elapsed deadline does not persist", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		// An absolute expiry already in the past can reach an adapter via setRaw or write
		// latency. The write must be accepted (not rejected, e.g. Redis `PX 0`) and the entry
		// must not survive as a live, never-expiring value.
		await s.set(key, faker.lorem.word(), expiresIn(-ttl));
		await delay(expiryDelay);
		t.expect(await s.get(key)).toBe(missingValue);
	});

	test("has(key) returns false for expired key", async (t) => {
		const s = store();
		const key = faker.string.alphanumeric(10);
		await s.set(key, faker.lorem.word(), expiresIn(ttl));
		await delay(expiryDelay);
		t.expect(await s.has(key)).toBe(false);
	});

	test("setMany with per-entry expires expires individual entries", async (t) => {
		const s = store();
		const key1 = faker.string.alphanumeric(10);
		const key2 = faker.string.alphanumeric(10);
		const val1 = faker.lorem.word();
		const val2 = faker.lorem.word();
		await s.setMany([
			{ key: key1, value: val1, expires: expiresIn(ttl) },
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
