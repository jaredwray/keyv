import type { KeyvStorageAdapter } from "keyv";

/** Factory function that returns a Keyv-compatible store instance. Used by Keyv-wrapper test suites. */
// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvStoreFn = () => KeyvStorageAdapter | any;

/**
 * A test registration function compatible with vitest's `it` or `test`.
 * Passed into test suite functions so tests register under the caller's test runner.
 */
export type TestFunction = (
	name: string,
	// biome-ignore lint/suspicious/noExplicitAny: minimal vitest context type
	fn: (context: { expect: (...args: any[]) => any }) => void | Promise<void>,
) => void;

/** Factory function that returns a {@link KeyvStorageAdapter} instance. Used by storage-level test suites. */
export type StorageFn = () => KeyvStorageAdapter;

/**
 * Options for configuring storage-level test suites.
 * Boolean flags control which test groups run (all default to `true`).
 */
export type StorageTestOptions = {
	/** Value returned by get() for missing/expired keys. Default: undefined */
	missingValue?: undefined | null;
	/** Enable basic CRUD tests (set/get/delete/has/clear). Default: true */
	basic?: boolean;
	/** Enable batch operation tests (setMany/getMany/hasMany/deleteMany). Default: true */
	batch?: boolean;
	/** Enable iterator tests. Default: true */
	iterator?: boolean;
	/** Enable TTL tests. Default: true */
	ttl?: boolean;
	/** Enable namespace getter/setter test. Default: true */
	namespace?: boolean;
	/** Enable disconnect test. Default: true */
	disconnect?: boolean;
};
