import { describe, expect, test } from "vitest";
import { KeyvSanitize } from "../src/sanitize.js";

describe("KeyvSanitize", () => {
	describe("pass-through (harmless characters stay unchanged)", () => {
		const s = new KeyvSanitize({ keys: true, namespace: true });

		test("single quote passes through", () => {
			expect(s.cleanKey("'")).toBe("'");
		});

		test("quote in key passes through", () => {
			expect(s.cleanKey("user's-data")).toBe("user's-data");
		});

		test("single slash passes through", () => {
			expect(s.cleanKey("key/subkey")).toBe("key/subkey");
		});

		test("dollar sign not at start passes through", () => {
			expect(s.cleanKey("price$5")).toBe("price$5");
		});

		test("curly braces without dollar pass through", () => {
			expect(s.cleanKey("curly{brace}")).toBe("curly{brace}");
		});

		test("double quotes pass through", () => {
			expect(s.cleanKey('key"value')).toBe('key"value');
		});

		test("backticks pass through", () => {
			expect(s.cleanKey("key`value")).toBe("key`value");
		});

		test("backslash passes through", () => {
			expect(s.cleanKey("key\\value")).toBe("key\\value");
		});

		test("clean keys unchanged", () => {
			expect(s.cleanKey("my-clean-key_123")).toBe("my-clean-key_123");
		});

		test("empty string unchanged", () => {
			expect(s.cleanKey("")).toBe("");
		});
	});

	describe("dangerous patterns are stripped", () => {
		const s = new KeyvSanitize({ keys: true, namespace: true });

		test("strips semicolons (SQL)", () => {
			expect(s.cleanKey("; DROP TABLE users")).toBe(" DROP TABLE users");
		});

		test("strips SQL comments (--)", () => {
			expect(s.cleanKey("key--comment")).toBe("keycomment");
		});

		test("strips SQL block comment open (/*)", () => {
			expect(s.cleanKey("key/*comment")).toBe("keycomment");
		});

		test("strips leading $ (MongoDB)", () => {
			expect(s.cleanKey("$where")).toBe("where");
		});

		test("strips {$ sequence (MongoDB)", () => {
			expect(s.cleanKey("key{$gt}")).toBe("keygt}");
		});

		test("strips path traversal ../", () => {
			expect(s.cleanKey("../../etc/passwd")).toBe("etc/passwd");
		});

		test("strips path traversal ..\\", () => {
			expect(s.cleanKey("..\\..\\etc\\passwd")).toBe("etc\\passwd");
		});

		test("strips null bytes", () => {
			expect(s.cleanKey("key\0value")).toBe("keyvalue");
		});

		test("strips newlines", () => {
			expect(s.cleanKey("key\nvalue")).toBe("keyvalue");
		});

		test("strips carriage returns", () => {
			expect(s.cleanKey("key\rvalue")).toBe("keyvalue");
		});

		test("strips all dangerous patterns from combined input", () => {
			expect(s.cleanKey(";--\0\n\r")).toBe("");
		});
	});

	describe("cleanKeys() method", () => {
		const s = new KeyvSanitize({ keys: true, namespace: true });

		test("sanitizes an array of keys", () => {
			expect(s.cleanKeys(["clean", "key;evil", "$bad"])).toEqual(["clean", "keyevil", "bad"]);
		});

		test("returns array unchanged when disabled", () => {
			const disabled = new KeyvSanitize();
			expect(disabled.cleanKeys(["key;evil"])).toEqual(["key;evil"]);
		});
	});

	describe("per-target category control", () => {
		test("preserves SQL patterns when keys.sql is disabled", () => {
			const s = new KeyvSanitize({ keys: { sql: false } });
			expect(s.cleanKey("key;--comment")).toBe("key;--comment");
		});

		test("preserves MongoDB patterns when keys.mongo is disabled", () => {
			const s = new KeyvSanitize({ keys: { mongo: false } });
			expect(s.cleanKey("$where")).toBe("$where");
		});

		test("preserves control chars when keys.escape is disabled", () => {
			const s = new KeyvSanitize({ keys: { escape: false } });
			expect(s.cleanKey("key\nvalue")).toBe("key\nvalue");
		});

		test("preserves path traversal when keys.path is disabled", () => {
			const s = new KeyvSanitize({ keys: { path: false } });
			expect(s.cleanKey("../../etc")).toBe("../../etc");
		});

		test("only strips enabled categories for keys", () => {
			const s = new KeyvSanitize({
				keys: { sql: true, mongo: false, escape: false, path: false },
			});
			expect(s.cleanKey("$key;--../\n")).toBe("$key../\n");
		});
	});

	describe("namespace sanitization", () => {
		test("sanitizes namespace when enabled", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			expect(s.cleanNamespace("ns;evil")).toBe("nsevil");
		});

		test("skips namespace when namespace is false", () => {
			const s = new KeyvSanitize({ namespace: false });
			expect(s.cleanNamespace("ns;evil")).toBe("ns;evil");
		});

		test("supports independent patterns for namespace", () => {
			const s = new KeyvSanitize({
				keys: { sql: true, path: false },
				namespace: { sql: false, path: true },
			});
			expect(s.cleanKey("key;../")).toBe("key../");
			expect(s.cleanNamespace("ns;../")).toBe("ns;");
		});
	});

	describe("disabled", () => {
		test("cleanKey() returns unchanged when disabled", () => {
			const s = new KeyvSanitize();
			expect(s.cleanKey("any'key$here;--")).toBe("any'key$here;--");
		});

		test("cleanNamespace() returns unchanged when disabled", () => {
			const s = new KeyvSanitize();
			expect(s.cleanNamespace("ns;evil")).toBe("ns;evil");
		});

		test("keysEnabled is false", () => {
			const s = new KeyvSanitize();
			expect(s.keysEnabled).toBe(false);
		});

		test("namespaceEnabled is false", () => {
			const s = new KeyvSanitize();
			expect(s.namespaceEnabled).toBe(false);
		});
	});

	describe("updateOptions()", () => {
		test("can switch from disabled to enabled", () => {
			const s = new KeyvSanitize();
			expect(s.cleanKey("key;evil")).toBe("key;evil");
			s.updateOptions({ keys: true, namespace: true });
			expect(s.keysEnabled).toBe(true);
			expect(s.cleanKey("key;evil")).toBe("keyevil");
		});

		test("can switch from enabled to disabled", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			expect(s.cleanKey("key;evil")).toBe("keyevil");
			s.updateOptions({});
			expect(s.keysEnabled).toBe(false);
			expect(s.cleanKey("key;evil")).toBe("key;evil");
		});

		test("updates keys and namespace getters", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			expect(s.keys).toEqual({ sql: true, mongo: true, escape: true, path: true });
			s.updateOptions({ keys: { sql: true } });
			expect(s.keys).toEqual({ sql: true, mongo: true, escape: true, path: true });
		});
	});

	describe("LRU cache", () => {
		test("returns cached result on repeated calls", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			const first = s.cleanKey("key;evil");
			const second = s.cleanKey("key;evil");
			expect(first).toBe("keyevil");
			expect(second).toBe("keyevil");
		});

		test("clearCache() empties the cache", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			s.cleanKey("key;evil");
			s.clearCache();
			// Still works after clearing
			expect(s.cleanKey("key;evil")).toBe("keyevil");
		});

		test("updateOptions() clears the cache", () => {
			const s = new KeyvSanitize({ keys: true, namespace: true });
			s.cleanKey("key;evil");
			s.updateOptions({ keys: { sql: false } });
			// After update, semicolons are no longer stripped
			expect(s.cleanKey("key;evil")).toBe("key;evil");
		});
	});
});
