import { describe, expect, test } from "vitest";
import {
	calculateExpires,
	isDataExpired,
	resolveTtl,
	toStoreExpires,
	ttlFromExpires,
} from "../src/utils.js";

describe("isDataExpired", () => {
	test("should detect expired, non-expired, and undefined expiry correctly", () => {
		expect(isDataExpired({ value: "x", expires: Date.now() - 1000 })).toBe(true);
		expect(isDataExpired({ value: "x", expires: Date.now() + 10_000 })).toBe(false);
		expect(isDataExpired({ value: "x", expires: undefined })).toBe(false);
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

	test("should round a fractional ttl up to a whole millisecond", () => {
		const before = Date.now();
		const result = calculateExpires(1500.5);
		expect(Number.isInteger(result)).toBe(true);
		expect(result).toBeGreaterThanOrEqual(before + 1501);
		expect(result).toBeLessThanOrEqual(Date.now() + 1501);
	});

	test("should return undefined for invalid inputs", () => {
		expect(calculateExpires(undefined)).toBeUndefined();
		expect(calculateExpires(0)).toBeUndefined();
		expect(calculateExpires(-100)).toBeUndefined();
		expect(calculateExpires(Number.NaN)).toBeUndefined();
		expect(calculateExpires(Number.POSITIVE_INFINITY)).toBeUndefined();
	});
});

describe("toStoreExpires", () => {
	test("should round a fractional expiry up to a whole millisecond", () => {
		expect(toStoreExpires(1_000.25)).toBe(1_001);
		expect(toStoreExpires(1_000)).toBe(1_000);
	});

	test("should return undefined when there is no finite expiry", () => {
		expect(toStoreExpires(undefined)).toBeUndefined();
		expect(toStoreExpires(Number.NaN)).toBeUndefined();
		expect(toStoreExpires(Number.POSITIVE_INFINITY)).toBeUndefined();
	});
});

describe("resolveTtl", () => {
	test("should resolve ttl with fallback to defaultTtl", () => {
		expect(resolveTtl(undefined, undefined)).toBeUndefined();
		expect(resolveTtl(undefined, 5000)).toBe(5000);
		expect(resolveTtl(3000, 5000)).toBe(3000);
	});

	test("should return undefined for invalid ttl values", () => {
		expect(resolveTtl(0, 5000)).toBeUndefined();
		expect(resolveTtl(0, undefined)).toBeUndefined();
		expect(resolveTtl(-1, 5000)).toBeUndefined();
		expect(resolveTtl(-1000, undefined)).toBeUndefined();
		expect(resolveTtl(Number.NaN, 5000)).toBeUndefined();
		expect(resolveTtl(Number.POSITIVE_INFINITY, 5000)).toBeUndefined();
		expect(resolveTtl(Number.NEGATIVE_INFINITY, 5000)).toBeUndefined();
	});

	test("should return undefined for invalid defaultTtl values", () => {
		expect(resolveTtl(undefined, 0)).toBeUndefined();
		expect(resolveTtl(undefined, -100)).toBeUndefined();
		expect(resolveTtl(undefined, Number.NaN)).toBeUndefined();
	});
});

describe("ttlFromExpires", () => {
	test("should return remaining TTL for future expires", () => {
		const result = ttlFromExpires(Date.now() + 10_000);
		expect(result).toBeGreaterThan(9000);
		expect(result).toBeLessThanOrEqual(10_000);
	});

	test("should return undefined for invalid or past expires values", () => {
		expect(ttlFromExpires(undefined)).toBeUndefined();
		expect(ttlFromExpires(Date.now() - 1000)).toBeUndefined();
		expect(ttlFromExpires(Date.now())).toBeUndefined();
		expect(ttlFromExpires(Number.NaN)).toBeUndefined();
		expect(ttlFromExpires(Number.POSITIVE_INFINITY)).toBeUndefined();
		expect(ttlFromExpires(Number.NEGATIVE_INFINITY)).toBeUndefined();
	});
});
