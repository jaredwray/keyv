import { describe, expect, test } from "vitest";
import { isKeyv } from "../src/capabilities.js";
import { Keyv } from "../src/index.js";

describe("capabilities", () => {
	describe("isKeyv", () => {
		test("should return all false for null", () => {
			const result = isKeyv(null);
			expect(result).toEqual({
				keyv: false,
				get: false,
				set: false,
				delete: false,
				clear: false,
				has: false,
				getMany: false,
				setMany: false,
				deleteMany: false,
				hasMany: false,
				disconnect: false,
				getRaw: false,
				getManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = isKeyv(undefined);
			expect(result).toEqual({
				keyv: false,
				get: false,
				set: false,
				delete: false,
				clear: false,
				has: false,
				getMany: false,
				setMany: false,
				deleteMany: false,
				hasMany: false,
				disconnect: false,
				getRaw: false,
				getManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = isKeyv("string");
			expect(result).toEqual({
				keyv: false,
				get: false,
				set: false,
				delete: false,
				clear: false,
				has: false,
				getMany: false,
				setMany: false,
				deleteMany: false,
				hasMany: false,
				disconnect: false,
				getRaw: false,
				getManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return keyv: false for new Map()", () => {
			const result = isKeyv(new Map());
			expect(result.keyv).toBe(false);
		});

		test("should detect Map capabilities correctly", () => {
			const result = isKeyv(new Map());
			expect(result).toEqual({
				keyv: false,
				get: true,
				set: true,
				delete: true,
				clear: true,
				has: true,
				getMany: false,
				setMany: false,
				deleteMany: false,
				hasMany: false,
				disconnect: false,
				getRaw: false,
				getManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return keyv: true for Keyv instance", () => {
			const keyv = new Keyv();
			const result = isKeyv(keyv);
			expect(result.keyv).toBe(true);
		});

		test("should detect all Keyv capabilities", () => {
			const keyv = new Keyv();
			const result = isKeyv(keyv);
			expect(result).toEqual({
				keyv: true,
				get: true,
				set: true,
				delete: true,
				clear: true,
				has: true,
				getMany: true,
				setMany: true,
				deleteMany: true,
				hasMany: true,
				disconnect: true,
				getRaw: true,
				getManyRaw: true,
				hooks: true,
				stats: true,
				iterator: true, // Iterator is present for Map store
			});
		});

		test("should detect iterator capability when present", () => {
			const keyv = new Keyv();
			// Map stores have iterator support
			keyv.iterator = async function* () {
				yield ["key", "value"];
			};
			const result = isKeyv(keyv);
			expect(result.iterator).toBe(true);
		});

		test("should handle partial Keyv-like objects", () => {
			const partialKeyv = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
			};
			const result = isKeyv(partialKeyv);
			expect(result.keyv).toBe(false); // Missing hooks and stats
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(true);
			expect(result.clear).toBe(true);
			expect(result.hooks).toBe(false);
			expect(result.stats).toBe(false);
		});

		test("should detect objects with only some methods", () => {
			const obj = {
				get: () => {},
				set: () => {},
			};
			const result = isKeyv(obj);
			expect(result.keyv).toBe(false);
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(false);
			expect(result.clear).toBe(false);
		});

		test("should not detect properties that are not functions", () => {
			const obj = {
				get: "not a function",
				set: "not a function",
				delete: "not a function",
				clear: "not a function",
				has: "not a function",
			};
			const result = isKeyv(obj);
			expect(result.get).toBe(false);
			expect(result.set).toBe(false);
			expect(result.delete).toBe(false);
			expect(result.clear).toBe(false);
			expect(result.has).toBe(false);
		});

		test("should detect hooks and stats as properties (not functions)", () => {
			const obj = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				hooks: {},
				stats: {},
			};
			const result = isKeyv(obj);
			expect(result.keyv).toBe(true); // Has all required core methods and properties
			expect(result.hooks).toBe(true);
			expect(result.stats).toBe(true);
		});

		test("should handle empty object", () => {
			const result = isKeyv({});
			expect(result).toEqual({
				keyv: false,
				get: false,
				set: false,
				delete: false,
				clear: false,
				has: false,
				getMany: false,
				setMany: false,
				deleteMany: false,
				hasMany: false,
				disconnect: false,
				getRaw: false,
				getManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should detect Keyv with custom store", () => {
			const customStore = new Map();
			const keyv = new Keyv({ store: customStore });
			const result = isKeyv(keyv);
			expect(result.keyv).toBe(true);
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
		});

		test("should handle objects with getMany but not other many methods", () => {
			const obj = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				getMany: () => {},
				hooks: {},
				stats: {},
			};
			const result = isKeyv(obj);
			expect(result.keyv).toBe(true);
			expect(result.getMany).toBe(true);
			expect(result.setMany).toBe(false);
			expect(result.deleteMany).toBe(false);
			expect(result.hasMany).toBe(false);
		});
	});
});
