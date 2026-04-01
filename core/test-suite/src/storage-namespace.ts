import type { StorageFn, TestFunction } from "./types.js";

const storageNamespaceTests = (test: TestFunction, store: StorageFn) => {
	test("namespace getter and setter", (t) => {
		const s = store();
		t.expect(s.namespace).toBeUndefined();
		s.namespace = "test-ns";
		t.expect(s.namespace).toBe("test-ns");
		s.namespace = undefined;
		t.expect(s.namespace).toBeUndefined();
	});

	/* v8 ignore start -- @preserve */
	test("createKeyPrefix returns prefixed key when namespace is set", (t) => {
		const s = store();
		// biome-ignore lint/suspicious/noExplicitAny: testing adapter method
		const adapter = s as any;
		if (typeof adapter.createKeyPrefix !== "function") {
			return;
		}

		t.expect(adapter.createKeyPrefix("key", "ns")).toContain("key");
		t.expect(adapter.createKeyPrefix("key", "ns")).toContain("ns");
		t.expect(adapter.createKeyPrefix("key")).toBe("key");
		t.expect(adapter.createKeyPrefix("key", undefined)).toBe("key");
	});

	test("removeKeyPrefix strips prefix when namespace is set", (t) => {
		const s = store();
		// biome-ignore lint/suspicious/noExplicitAny: testing adapter method
		const adapter = s as any;
		if (typeof adapter.removeKeyPrefix !== "function") {
			return;
		}

		t.expect(adapter.removeKeyPrefix("ns:key", "ns")).toBe("key");
		t.expect(adapter.removeKeyPrefix("key")).toBe("key");
		t.expect(adapter.removeKeyPrefix("key", undefined)).toBe("key");
	});

	test("formatKey avoids double prefix", (t) => {
		const s = store();
		// biome-ignore lint/suspicious/noExplicitAny: testing adapter method
		const adapter = s as any;
		if (typeof adapter.formatKey !== "function") {
			return;
		}

		s.namespace = "ns";
		const prefixed = adapter.formatKey("key") as string;
		t.expect(prefixed).toContain("ns");
		t.expect(prefixed).toContain("key");
		// Applying formatKey again should not double-prefix
		t.expect(adapter.formatKey(prefixed)).toBe(prefixed);
		s.namespace = undefined;
		t.expect(adapter.formatKey("key")).toBe("key");
	});

	test("keyPrefixSeparator getter and setter", (t) => {
		const s = store();
		// biome-ignore lint/suspicious/noExplicitAny: testing adapter method
		const adapter = s as any;
		if (!("keyPrefixSeparator" in adapter)) {
			return;
		}

		const original = adapter.keyPrefixSeparator as string;
		t.expect(typeof original).toBe("string");
		adapter.keyPrefixSeparator = "::";
		t.expect(adapter.keyPrefixSeparator).toBe("::");
		adapter.keyPrefixSeparator = original;
	});
	/* v8 ignore stop */
};

export { storageNamespaceTests };
