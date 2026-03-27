import { describe, expect, test } from "vitest";
import { buildSanitizePattern, sanitizeKey } from "../src/utils.js";

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
