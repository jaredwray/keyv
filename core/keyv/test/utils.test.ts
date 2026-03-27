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
		expect(isDataExpired({ value: "x", expires: Date.now() - 1000 })).toBe(
			true,
		);
	});

	test("should return false when expires is in the future", () => {
		expect(isDataExpired({ value: "x", expires: Date.now() + 10_000 })).toBe(
			false,
		);
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
	describe("with all categories enabled (default)", () => {
		const pattern = buildSanitizePattern();

		test("should strip SQL injection characters", () => {
			expect(sanitizeKey("key'with\"quotes`and;semi", pattern)).toBe(
				"keywithquotesandsemi",
			);
		});

		test("should strip MongoDB operator characters", () => {
			expect(sanitizeKey("key$with{curly}braces", pattern)).toBe(
				"keywithcurlybraces",
			);
		});

		test("should strip escape and control characters", () => {
			expect(sanitizeKey("key\\with\0null\nand\rcontrol", pattern)).toBe(
				"keywithnullandcontrol",
			);
		});

		test("should strip path traversal characters", () => {
			expect(sanitizeKey("key/with/slashes", pattern)).toBe("keywithslashes");
		});

		test("should leave clean keys unchanged", () => {
			expect(sanitizeKey("my-clean-key_123", pattern)).toBe("my-clean-key_123");
		});

		test("should return empty string for all-dangerous input", () => {
			// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal $ and {} chars
			expect(sanitizeKey("'\"`${};\\/\0\n\r", pattern)).toBe("");
		});

		test("should handle empty string", () => {
			expect(sanitizeKey("", pattern)).toBe("");
		});
	});

	describe("with individual categories disabled", () => {
		test("should preserve SQL characters when sql is disabled", () => {
			const pattern = buildSanitizePattern({ sql: false });
			expect(sanitizeKey("key'with;semi", pattern)).toBe("key'with;semi");
		});

		test("should preserve MongoDB characters when mongo is disabled", () => {
			const pattern = buildSanitizePattern({ mongo: false });
			expect(sanitizeKey("key$with{braces}", pattern)).toBe("key$with{braces}");
		});

		test("should preserve escape characters when escape is disabled", () => {
			const pattern = buildSanitizePattern({ escape: false });
			expect(sanitizeKey("key\\with\nnewline", pattern)).toBe(
				"key\\with\nnewline",
			);
		});

		test("should preserve path characters when path is disabled", () => {
			const pattern = buildSanitizePattern({ path: false });
			expect(sanitizeKey("key/with/slashes", pattern)).toBe("key/with/slashes");
		});

		test("should only strip enabled categories", () => {
			const pattern = buildSanitizePattern({
				sql: true,
				mongo: false,
				escape: false,
				path: false,
			});
			expect(sanitizeKey("key'$with/stuff\\here", pattern)).toBe(
				"key$with/stuff\\here",
			);
		});
	});

	describe("buildSanitizePattern", () => {
		test("should return undefined when all categories are disabled", () => {
			const pattern = buildSanitizePattern({
				sql: false,
				mongo: false,
				escape: false,
				path: false,
			});
			expect(pattern).toBeUndefined();
		});

		test("should return a RegExp when at least one category is enabled", () => {
			const pattern = buildSanitizePattern({
				sql: false,
				mongo: false,
				escape: false,
				path: true,
			});
			expect(pattern).toBeInstanceOf(RegExp);
		});

		test("sanitizeKey with undefined pattern returns key unchanged", () => {
			expect(sanitizeKey("any'key$here", undefined)).toBe("any'key$here");
		});
	});
});
