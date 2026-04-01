import type { StorageFn, StorageTestOptions, TestFunction } from "./types.js";

/**
 * Registers namespace getter/setter tests directly on the storage adapter.
 * Skipped if `options.namespace` is `false`.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param store - Factory that returns a fresh {@link KeyvStorageAdapter} instance
 * @param options - Test configuration (toggle flags)
 */
const storageNamespaceTests = (
	test: TestFunction,
	store: StorageFn,
	options?: StorageTestOptions,
) => {
	/* v8 ignore next 3 -- @preserve */
	if (options?.namespace === false) {
		return;
	}

	test("namespace getter and setter", (t) => {
		const s = store();
		t.expect(s.namespace).toBeUndefined();
		s.namespace = "test-ns";
		t.expect(s.namespace).toBe("test-ns");
		s.namespace = undefined;
		t.expect(s.namespace).toBeUndefined();
	});
};

export { storageNamespaceTests };
