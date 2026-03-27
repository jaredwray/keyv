import { describe, expect, test } from "vitest";
import { KeyvSanitize } from "../src/sanitize.js";
import { isDataExpired, resolveTtl, ttlFromExpires } from "../src/utils.js";

describe("isDataExpired", () => {
	test("should return true when expires is in the past", () => {
		expect(isDataExpired({ value: "x", expires: Date.now() - 1000 })).toBe(true);
	});

	test("should return false when expires is in the future", () => {
		expect(isDataExpired({ value: "x", expires: Date.now() + 10_000 })).toBe(false);
	});

	test("should return false when expires is undefined", () => {
		expect(isDataExpired({ value: "x", expires: undefined })).toBe(false);
	});

	test("should return false when expires is not set", () => {
		expect(isDataExpired({ value: "x" })).toBe(false);
	});
});

describe("resolveTtl", () => {
	test("should return undefined when both args are undefined", () => {
		expect(resolveTtl(undefined, undefined)).toBeUndefined();
	});

	test("should fall back to defaultTtl when ttl is undefined", () => {
		expect(resolveTtl(undefined, 5000)).toBe(5000);
	});

	test("should use explicit ttl over defaultTtl", () => {
		expect(resolveTtl(3000, 5000)).toBe(3000);
	});

	test("should return undefined when ttl is 0", () => {
		expect(resolveTtl(0, 5000)).toBeUndefined();
	});

	test("should return undefined when ttl is 0 and no default", () => {
		expect(resolveTtl(0, undefined)).toBeUndefined();
	});

	test("should return undefined when ttl is negative", () => {
		expect(resolveTtl(-1, 5000)).toBeUndefined();
	});

	test("should return undefined when ttl is a large negative number", () => {
		expect(resolveTtl(-1000, undefined)).toBeUndefined();
	});

	test("should return undefined when ttl is NaN", () => {
		expect(resolveTtl(Number.NaN, 5000)).toBeUndefined();
	});

	test("should return undefined when ttl is Infinity", () => {
		expect(resolveTtl(Number.POSITIVE_INFINITY, 5000)).toBeUndefined();
	});

	test("should return undefined when ttl is -Infinity", () => {
		expect(resolveTtl(Number.NEGATIVE_INFINITY, 5000)).toBeUndefined();
	});

	test("should return undefined when defaultTtl is 0", () => {
		expect(resolveTtl(undefined, 0)).toBeUndefined();
	});

	test("should return undefined when defaultTtl is negative", () => {
		expect(resolveTtl(undefined, -100)).toBeUndefined();
	});

	test("should return undefined when defaultTtl is NaN", () => {
		expect(resolveTtl(undefined, Number.NaN)).toBeUndefined();
	});
});

describe("ttlFromExpires", () => {
	test("should return undefined when expires is undefined", () => {
		expect(ttlFromExpires(undefined)).toBeUndefined();
	});

	test("should return remaining TTL for future expires", () => {
		const result = ttlFromExpires(Date.now() + 10_000);
		expect(result).toBeGreaterThan(9000);
		expect(result).toBeLessThanOrEqual(10_000);
	});

	test("should return undefined when expires is in the past", () => {
		expect(ttlFromExpires(Date.now() - 1000)).toBeUndefined();
	});

	test("should return undefined when expires is exactly now", () => {
		expect(ttlFromExpires(Date.now())).toBeUndefined();
	});

	test("should return undefined when expires is NaN", () => {
		expect(ttlFromExpires(Number.NaN)).toBeUndefined();
	});

	test("should return undefined when expires is Infinity", () => {
		expect(ttlFromExpires(Number.POSITIVE_INFINITY)).toBeUndefined();
	});

	test("should return undefined when expires is -Infinity", () => {
		expect(ttlFromExpires(Number.NEGATIVE_INFINITY)).toBeUndefined();
	});
});

describe("KeyvSanitize", () => {
	describe("pass-through (harmless characters stay unchanged)", () => {
		const s = new KeyvSanitize(true);

		test("single quote passes through", () => {
			expect(s.key("'")).toBe("'");
		});

		test("quote in key passes through", () => {
			expect(s.key("user's-data")).toBe("user's-data");
		});

		test("single slash passes through", () => {
			expect(s.key("key/subkey")).toBe("key/subkey");
		});

		test("dollar sign not at start passes through", () => {
			expect(s.key("price$5")).toBe("price$5");
		});

		test("curly braces without dollar pass through", () => {
			expect(s.key("curly{brace}")).toBe("curly{brace}");
		});

		test("double quotes pass through", () => {
			expect(s.key('key"value')).toBe('key"value');
		});

		test("backticks pass through", () => {
			expect(s.key("key`value")).toBe("key`value");
		});

		test("backslash passes through", () => {
			expect(s.key("key\\value")).toBe("key\\value");
		});

		test("clean keys unchanged", () => {
			expect(s.key("my-clean-key_123")).toBe("my-clean-key_123");
		});

		test("empty string unchanged", () => {
			expect(s.key("")).toBe("");
		});
	});

	describe("dangerous patterns are stripped", () => {
		const s = new KeyvSanitize(true);

		test("strips semicolons (SQL)", () => {
			expect(s.key("; DROP TABLE users")).toBe(" DROP TABLE users");
		});

		test("strips SQL comments (--)", () => {
			expect(s.key("key--comment")).toBe("keycomment");
		});

		test("strips SQL block comment open (/*)", () => {
			expect(s.key("key/*comment")).toBe("keycomment");
		});

		test("strips leading $ (MongoDB)", () => {
			expect(s.key("$where")).toBe("where");
		});

		test("strips {$ sequence (MongoDB)", () => {
			expect(s.key("key{$gt}")).toBe("keygt}");
		});

		test("strips path traversal ../", () => {
			expect(s.key("../../etc/passwd")).toBe("etc/passwd");
		});

		test("strips path traversal ..\\", () => {
			expect(s.key("..\\..\\etc\\passwd")).toBe("etc\\passwd");
		});

		test("strips null bytes", () => {
			expect(s.key("key\0value")).toBe("keyvalue");
		});

		test("strips newlines", () => {
			expect(s.key("key\nvalue")).toBe("keyvalue");
		});

		test("strips carriage returns", () => {
			expect(s.key("key\rvalue")).toBe("keyvalue");
		});

		test("strips all dangerous patterns from combined input", () => {
			expect(s.key(";--\0\n\r")).toBe("");
		});
	});

	describe("keys() method", () => {
		const s = new KeyvSanitize(true);

		test("sanitizes an array of keys", () => {
			expect(s.keys(["clean", "key;evil", "$bad"])).toEqual(["clean", "keyevil", "bad"]);
		});

		test("returns array unchanged when disabled", () => {
			const disabled = new KeyvSanitize(false);
			expect(disabled.keys(["key;evil"])).toEqual(["key;evil"]);
		});
	});

	describe("per-target category control", () => {
		test("preserves SQL patterns when keys.sql is disabled", () => {
			const s = new KeyvSanitize({ keys: { sql: false } });
			expect(s.key("key;--comment")).toBe("key;--comment");
		});

		test("preserves MongoDB patterns when keys.mongo is disabled", () => {
			const s = new KeyvSanitize({ keys: { mongo: false } });
			expect(s.key("$where")).toBe("$where");
		});

		test("preserves control chars when keys.escape is disabled", () => {
			const s = new KeyvSanitize({ keys: { escape: false } });
			expect(s.key("key\nvalue")).toBe("key\nvalue");
		});

		test("preserves path traversal when keys.path is disabled", () => {
			const s = new KeyvSanitize({ keys: { path: false } });
			expect(s.key("../../etc")).toBe("../../etc");
		});

		test("only strips enabled categories for keys", () => {
			const s = new KeyvSanitize({
				keys: { sql: true, mongo: false, escape: false, path: false },
			});
			expect(s.key("$key;--../\n")).toBe("$key../\n");
		});
	});

	describe("namespace sanitization", () => {
		test("sanitizes namespace when enabled", () => {
			const s = new KeyvSanitize(true);
			expect(s.namespace("ns;evil")).toBe("nsevil");
		});

		test("skips namespace when namespace is false", () => {
			const s = new KeyvSanitize({ namespace: false });
			expect(s.namespace("ns;evil")).toBe("ns;evil");
		});

		test("supports independent patterns for namespace", () => {
			const s = new KeyvSanitize({
				keys: { sql: true, path: false },
				namespace: { sql: false, path: true },
			});
			expect(s.key("key;../")).toBe("key../");
			expect(s.namespace("ns;../")).toBe("ns;");
		});
	});

	describe("disabled", () => {
		test("key() returns unchanged when disabled", () => {
			const s = new KeyvSanitize(false);
			expect(s.key("any'key$here;--")).toBe("any'key$here;--");
		});

		test("namespace() returns unchanged when disabled", () => {
			const s = new KeyvSanitize(false);
			expect(s.namespace("ns;evil")).toBe("ns;evil");
		});

		test("enabled is false", () => {
			const s = new KeyvSanitize(false);
			expect(s.enabled).toBe(false);
		});
	});

	describe("update()", () => {
		test("can switch from disabled to enabled", () => {
			const s = new KeyvSanitize(false);
			expect(s.key("key;evil")).toBe("key;evil");
			s.update(true);
			expect(s.enabled).toBe(true);
			expect(s.key("key;evil")).toBe("keyevil");
		});

		test("can switch from enabled to disabled", () => {
			const s = new KeyvSanitize(true);
			expect(s.key("key;evil")).toBe("keyevil");
			s.update(false);
			expect(s.enabled).toBe(false);
			expect(s.key("key;evil")).toBe("key;evil");
		});

		test("updates options getter", () => {
			const s = new KeyvSanitize(true);
			expect(s.options).toBe(true);
			s.update({ keys: { sql: true } });
			expect(s.options).toEqual({ keys: { sql: true } });
		});
	});

	describe("LRU cache", () => {
		test("returns cached result on repeated calls", () => {
			const s = new KeyvSanitize(true);
			const first = s.key("key;evil");
			const second = s.key("key;evil");
			expect(first).toBe("keyevil");
			expect(second).toBe("keyevil");
		});

		test("clearCache() empties the cache", () => {
			const s = new KeyvSanitize(true);
			s.key("key;evil");
			s.clearCache();
			// Still works after clearing
			expect(s.key("key;evil")).toBe("keyevil");
		});

		test("update() clears the cache", () => {
			const s = new KeyvSanitize(true);
			s.key("key;evil");
			s.update({ keys: { sql: false } });
			// After update, semicolons are no longer stripped
			expect(s.key("key;evil")).toBe("key;evil");
		});
	});
});
