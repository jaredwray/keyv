import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Registers disconnect test directly on the storage adapter.
 * Verifies that `disconnect()` resolves without error. Skipped if `options.disconnect` is `false`.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param store - Factory that returns a fresh {@link KeyvStorageAdapter} instance
 * @param options - Test configuration (toggle flags)
 */
const storageDisconnectTests = (
	test: TestFunction,
	store: StorageFn,
	options?: StorageTestOptions,
) => {
	/* v8 ignore next 3 -- @preserve */
	if (options?.disconnect === false) {
		return;
	}

	test("disconnect() resolves without error", async (t) => {
		const s = store();
		/* v8 ignore next 3 -- @preserve */
		if (typeof s.disconnect !== "function") {
			return;
		}

		await s.disconnect();
		t.expect(true).toBe(true);
	});
};

export { storageDisconnectTests };
