import { describe, expect, test } from "vitest";
import { calculateExpires, isDataExpired, resolveTtl, ttlFromExpires } from "../src/utils.js";

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

describe("calculateExpires", () => {
	test("should return a future timestamp for a positive ttl", () => {
		const before = Date.now();
		const result = calculateExpires(5000);
		expect(result).toBeGreaterThanOrEqual(before + 5000);
		expect(result).toBeLessThanOrEqual(Date.now() + 5000);
	});

	test("should return undefined for undefined", () => {
		expect(calculateExpires(undefined)).toBeUndefined();
	});

	test("should return undefined for zero", () => {
		expect(calculateExpires(0)).toBeUndefined();
	});

	test("should return undefined for negative values", () => {
		expect(calculateExpires(-100)).toBeUndefined();
	});

	test("should return undefined for NaN", () => {
		expect(calculateExpires(Number.NaN)).toBeUndefined();
	});

	test("should return undefined for Infinity", () => {
		expect(calculateExpires(Number.POSITIVE_INFINITY)).toBeUndefined();
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
