import { describe, expect, test } from "vitest";
import { KeyvSanitize } from "../src/sanitize.js";

describe("KeyvSanitize", () => {
	test("harmless characters pass through unchanged", () => {
		const s = new KeyvSanitize({ keys: true, namespace: true });
		expect(s.cleanKey("'")).toBe("'");
		expect(s.cleanKey("user's-data")).toBe("user's-data");
		expect(s.cleanKey("key/subkey")).toBe("key/subkey");
		expect(s.cleanKey("price$5")).toBe("price$5");
		expect(s.cleanKey("curly{brace}")).toBe("curly{brace}");
		expect(s.cleanKey('key"value')).toBe('key"value');
		expect(s.cleanKey("key`value")).toBe("key`value");
		expect(s.cleanKey("key\\value")).toBe("key\\value");
		expect(s.cleanKey("my-clean-key_123")).toBe("my-clean-key_123");
		expect(s.cleanKey("")).toBe("");
	});

	test("dangerous patterns are stripped", () => {
		const s = new KeyvSanitize({ keys: true, namespace: true });
		// SQL
		expect(s.cleanKey("; DROP TABLE users")).toBe(" DROP TABLE users");
		expect(s.cleanKey("key--comment")).toBe("keycomment");
		expect(s.cleanKey("key/*comment")).toBe("keycomment");
		// MongoDB
		expect(s.cleanKey("$where")).toBe("where");
		expect(s.cleanKey("key{$gt}")).toBe("keygt}");
		// Path traversal
		expect(s.cleanKey("../../etc/passwd")).toBe("etc/passwd");
		expect(s.cleanKey("..\\..\\etc\\passwd")).toBe("etc\\passwd");
		// Control characters
		expect(s.cleanKey("key\0value")).toBe("keyvalue");
		expect(s.cleanKey("key\nvalue")).toBe("keyvalue");
		expect(s.cleanKey("key\rvalue")).toBe("keyvalue");
		// Combined
		expect(s.cleanKey(";--\0\n\r")).toBe("");
	});

	test("cleanKeys() sanitizes arrays and respects disabled state", () => {
		const s = new KeyvSanitize({ keys: true, namespace: true });
		expect(s.cleanKeys(["clean", "key;evil", "$bad"])).toEqual(["clean", "keyevil", "bad"]);

		const disabled = new KeyvSanitize();
		expect(disabled.cleanKeys(["key;evil"])).toEqual(["key;evil"]);
	});

	test("per-target category control", () => {
		expect(new KeyvSanitize({ keys: { sql: false } }).cleanKey("key;--comment")).toBe(
			"key;--comment",
		);
		expect(new KeyvSanitize({ keys: { mongo: false } }).cleanKey("$where")).toBe("$where");
		expect(new KeyvSanitize({ keys: { escape: false } }).cleanKey("key\nvalue")).toBe("key\nvalue");
		expect(new KeyvSanitize({ keys: { path: false } }).cleanKey("../../etc")).toBe("../../etc");

		// Only strips enabled categories
		const s = new KeyvSanitize({ keys: { sql: true, mongo: false, escape: false, path: false } });
		expect(s.cleanKey("$key;--../\n")).toBe("$key../\n");
	});

	test("namespace sanitization with independent patterns", () => {
		const s1 = new KeyvSanitize({ keys: true, namespace: true });
		expect(s1.cleanNamespace("ns;evil")).toBe("nsevil");

		const s2 = new KeyvSanitize({ namespace: false });
		expect(s2.cleanNamespace("ns;evil")).toBe("ns;evil");

		// Independent patterns for keys vs namespace
		const s3 = new KeyvSanitize({
			keys: { sql: true, path: false },
			namespace: { sql: false, path: true },
		});
		expect(s3.cleanKey("key;../")).toBe("key../");
		expect(s3.cleanNamespace("ns;../")).toBe("ns;");
	});

	test("disabled state returns everything unchanged", () => {
		const s = new KeyvSanitize();
		expect(s.enabled).toBe(false);
		expect(s.cleanKey("any'key$here;--")).toBe("any'key$here;--");
		expect(s.cleanNamespace("ns;evil")).toBe("ns;evil");
	});

	test("updateOptions() toggles behavior and clears cache", () => {
		// Disabled → enabled
		const s = new KeyvSanitize();
		expect(s.cleanKey("key;evil")).toBe("key;evil");
		s.updateOptions({ keys: true, namespace: true });
		expect(s.enabled).toBe(true);
		expect(s.cleanKey("key;evil")).toBe("keyevil");

		// Enabled → disabled
		s.updateOptions({});
		expect(s.enabled).toBe(false);
		expect(s.cleanKey("key;evil")).toBe("key;evil");

		// Updates keys getter
		const s2 = new KeyvSanitize({ keys: true, namespace: true });
		expect(s2.keys).toEqual({ sql: true, mongo: true, escape: true, path: true });
		s2.updateOptions({ keys: { sql: true } });
		expect(s2.keys).toEqual({ sql: true, mongo: true, escape: true, path: true });
	});

	describe("LRU cache", () => {
		test("returns cached results and clearCache works", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			expect(s.cleanKey("key;evil")).toBe("keyevil");
			expect(s.cleanKey("key;evil")).toBe("keyevil"); // cached
			expect(s.cleanNamespace("ns;evil")).toBe("nsevil");
			expect(s.cleanNamespace("ns;evil")).toBe("nsevil"); // cached
			s.clearCache();
			expect(s.cleanKey("key;evil")).toBe("keyevil"); // still works

			// updateOptions clears cache
			s.cleanKey("key;evil");
			s.updateOptions({ keys: { sql: false } });
			expect(s.cleanKey("key;evil")).toBe("key;evil");
		});

		test("evicts oldest entries when cache exceeds max", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			// biome-ignore lint/suspicious/noExplicitAny: accessing private for test
			const instance = s as any;
			instance._cacheMax = 2;

			// Keys cache
			s.cleanKey("a;");
			s.cleanKey("b;");
			s.cleanKey("c;");
			expect(instance._cacheKeys.has("a;")).toBe(false);
			expect(instance._cacheKeys.has("c;")).toBe(true);

			// Namespace cache
			s.cleanNamespace("a;");
			s.cleanNamespace("b;");
			s.cleanNamespace("c;");
			expect(instance._cacheNamespaces.has("a;")).toBe(false);
			expect(instance._cacheNamespaces.has("c;")).toBe(true);
		});
	});

	test("namespace getter returns pattern configuration", () => {
		const s = new KeyvSanitize({ keys: true, namespace: { sql: true, mongo: false } });
		expect(s.namespace).toEqual({ sql: true, mongo: false, escape: true, path: true });
	});
});
