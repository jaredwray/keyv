import { describe, expect, test } from "vitest";
import {
	buildSanitizePattern,
	isDataExpired,
	resolveTtl,
	sanitizeKey,
	ttlFromExpires,
} from "../src/utils.js";

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

describe("sanitizeKey", () => {
	describe("pass-through (harmless characters stay unchanged)", () => {
		const pattern = buildSanitizePattern();

		test("single quote passes through", () => {
			expect(sanitizeKey("'", pattern)).toBe("'");
		});

		test("quote in key passes through", () => {
			expect(sanitizeKey("user's-data", pattern)).toBe("user's-data");
		});

		test("single slash passes through", () => {
			expect(sanitizeKey("key/subkey", pattern)).toBe("key/subkey");
		});

		test("dollar sign not at start passes through", () => {
			expect(sanitizeKey("price$5", pattern)).toBe("price$5");
		});

		test("curly braces without dollar pass through", () => {
			expect(sanitizeKey("curly{brace}", pattern)).toBe("curly{brace}");
		});

		test("double quotes pass through", () => {
			expect(sanitizeKey('key"value', pattern)).toBe('key"value');
		});

		test("backticks pass through", () => {
			expect(sanitizeKey("key`value", pattern)).toBe("key`value");
		});

		test("backslash passes through", () => {
			expect(sanitizeKey("key\\value", pattern)).toBe("key\\value");
		});

		test("clean keys unchanged", () => {
			expect(sanitizeKey("my-clean-key_123", pattern)).toBe("my-clean-key_123");
		});

		test("empty string unchanged", () => {
			expect(sanitizeKey("", pattern)).toBe("");
		});
	});

	describe("dangerous patterns are stripped", () => {
		const pattern = buildSanitizePattern();

		test("strips semicolons (SQL)", () => {
			expect(sanitizeKey("; DROP TABLE users", pattern)).toBe(" DROP TABLE users");
		});

		test("strips SQL comments (--)", () => {
			expect(sanitizeKey("key--comment", pattern)).toBe("keycomment");
		});

		test("strips SQL block comment open (/*)", () => {
			expect(sanitizeKey("key/*comment", pattern)).toBe("keycomment");
		});

		test("strips leading $ (MongoDB)", () => {
			expect(sanitizeKey("$where", pattern)).toBe("where");
		});

		test("strips {$ sequence (MongoDB)", () => {
			expect(sanitizeKey("key{$gt}", pattern)).toBe("keygt}");
		});

		test("strips path traversal ../", () => {
			expect(sanitizeKey("../../etc/passwd", pattern)).toBe("etc/passwd");
		});

		test("strips path traversal ..\\", () => {
			expect(sanitizeKey("..\\..\\etc\\passwd", pattern)).toBe("etc\\passwd");
		});

		test("strips null bytes", () => {
			expect(sanitizeKey("key\0value", pattern)).toBe("keyvalue");
		});

		test("strips newlines", () => {
			expect(sanitizeKey("key\nvalue", pattern)).toBe("keyvalue");
		});

		test("strips carriage returns", () => {
			expect(sanitizeKey("key\rvalue", pattern)).toBe("keyvalue");
		});

		test("strips all dangerous patterns from combined input", () => {
			expect(sanitizeKey(";--\0\n\r", pattern)).toBe("");
		});
	});

	describe("with individual categories disabled", () => {
		test("preserves SQL patterns when sql is disabled", () => {
			const pattern = buildSanitizePattern({ sql: false });
			expect(sanitizeKey("key;--comment", pattern)).toBe("key;--comment");
		});

		test("preserves MongoDB patterns when mongo is disabled", () => {
			const pattern = buildSanitizePattern({ mongo: false });
			expect(sanitizeKey("$where", pattern)).toBe("$where");
		});

		test("preserves control chars when escape is disabled", () => {
			const pattern = buildSanitizePattern({ escape: false });
			expect(sanitizeKey("key\nvalue", pattern)).toBe("key\nvalue");
		});

		test("preserves path traversal when path is disabled", () => {
			const pattern = buildSanitizePattern({ path: false });
			expect(sanitizeKey("../../etc", pattern)).toBe("../../etc");
		});

		test("only strips enabled categories", () => {
			const pattern = buildSanitizePattern({
				sql: true,
				mongo: false,
				escape: false,
				path: false,
			});
			expect(sanitizeKey("$key;--../\n", pattern)).toBe("$key../\n");
		});
	});

	describe("buildSanitizePattern", () => {
		test("returns undefined when all categories are disabled", () => {
			const pattern = buildSanitizePattern({
				sql: false,
				mongo: false,
				escape: false,
				path: false,
			});
			expect(pattern).toBeUndefined();
		});

		test("returns an array when at least one category is enabled", () => {
			const pattern = buildSanitizePattern({
				sql: false,
				mongo: false,
				escape: false,
				path: true,
			});
			expect(Array.isArray(pattern)).toBe(true);
		});

		test("sanitizeKey with undefined pattern returns key unchanged", () => {
			expect(sanitizeKey("any'key$here;--", undefined)).toBe("any'key$here;--");
		});
	});
});
