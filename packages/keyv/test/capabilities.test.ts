import { describe, expect, test } from "vitest";
import {
	isKeyv,
	isKeyvCompression,
	isKeyvEncryption,
	isKeyvSerialization,
	isKeyvStorage,
} from "../src/capabilities.js";
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

	describe("isKeyvStorage", () => {
		test("should return all false for null", () => {
			const result = isKeyvStorage(null);
			expect(result).toEqual({
				keyvStorage: false,
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
				iterator: false,
				namespace: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = isKeyvStorage(undefined);
			expect(result).toEqual({
				keyvStorage: false,
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
				iterator: false,
				namespace: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = isKeyvStorage("string");
			expect(result).toEqual({
				keyvStorage: false,
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
				iterator: false,
				namespace: false,
			});
		});

		test("should return keyvStorage: true for new Map()", () => {
			const result = isKeyvStorage(new Map());
			expect(result.keyvStorage).toBe(true);
		});

		test("should detect Map capabilities correctly", () => {
			const result = isKeyvStorage(new Map());
			expect(result).toEqual({
				keyvStorage: true, // Map has core methods
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
				iterator: false, // Map has Symbol.iterator, not iterator method
				namespace: false,
			});
		});

		test("should return keyvStorage: true for storage adapter-like object", () => {
			const adapter = {
				namespace: "test",
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
			};
			const result = isKeyvStorage(adapter);
			expect(result.keyvStorage).toBe(true);
		});

		test("should detect all storage adapter capabilities", () => {
			const adapter = {
				namespace: "test",
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
				has: async () => true,
				getMany: async () => [],
				setMany: async () => {},
				deleteMany: async () => true,
				hasMany: async () => [],
				disconnect: async () => {},
				iterator: async function* () {
					yield ["key", "value"];
				},
			};
			const result = isKeyvStorage(adapter);
			expect(result).toEqual({
				keyvStorage: true,
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
				iterator: true,
				namespace: true,
			});
		});

		test("should handle partial storage adapter objects", () => {
			const partialAdapter = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
			};
			const result = isKeyvStorage(partialAdapter);
			expect(result.keyvStorage).toBe(true); // Has all core methods
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(true);
			expect(result.clear).toBe(true);
		});

		test("should detect objects with only some methods", () => {
			const obj = {
				get: () => {},
				set: () => {},
			};
			const result = isKeyvStorage(obj);
			expect(result.keyvStorage).toBe(false); // Missing delete and clear
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
			const result = isKeyvStorage(obj);
			expect(result.get).toBe(false);
			expect(result.set).toBe(false);
			expect(result.delete).toBe(false);
			expect(result.clear).toBe(false);
			expect(result.has).toBe(false);
		});

		test("should handle empty object", () => {
			const result = isKeyvStorage({});
			expect(result).toEqual({
				keyvStorage: false,
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
				iterator: false,
				namespace: false,
			});
		});

		test("should detect Keyv.store as storage adapter", () => {
			const keyv = new Keyv();
			const result = isKeyvStorage(keyv.store);
			expect(result.keyvStorage).toBe(true); // Map has core methods
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(true);
			expect(result.clear).toBe(true);
		});

		test("should handle storage adapter without namespace", () => {
			const adapter = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
			};
			const result = isKeyvStorage(adapter);
			expect(result.keyvStorage).toBe(true);
			expect(result.namespace).toBe(false);
		});
	});

	describe("isKeyvCompression", () => {
		test("should return all false for null", () => {
			const result = isKeyvCompression(null);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = isKeyvCompression(undefined);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = isKeyvCompression("string");
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should return keyvCompression: true for valid compression adapter", () => {
			const adapter = {
				compress: (data: string) => data,
				decompress: (data: string) => data,
			};
			const result = isKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: true,
				compress: true,
				decompress: true,
			});
		});

		test("should return keyvCompression: false for object with only compress", () => {
			const adapter = {
				compress: (data: string) => data,
			};
			const result = isKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: false,
				compress: true,
				decompress: false,
			});
		});

		test("should return keyvCompression: false for object with only decompress", () => {
			const adapter = {
				decompress: (data: string) => data,
			};
			const result = isKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: true,
			});
		});

		test("should handle empty object", () => {
			const result = isKeyvCompression({});
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should not detect properties that are not functions", () => {
			const obj = {
				compress: "not a function",
				decompress: "not a function",
			};
			const result = isKeyvCompression(obj);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should detect async compression functions", () => {
			const adapter = {
				compress: async (data: string) => data,
				decompress: async (data: string) => data,
			};
			const result = isKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: true,
				compress: true,
				decompress: true,
			});
		});

		test("should handle compression adapter with additional properties", () => {
			const adapter = {
				compress: (data: string) => data,
				decompress: (data: string) => data,
				serialize: (data: unknown) => JSON.stringify(data),
				deserialize: (data: string) => JSON.parse(data),
			};
			const result = isKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: true,
				compress: true,
				decompress: true,
			});
		});
	});

	describe("isKeyvSerialization", () => {
		test("should return all false for null", () => {
			const result = isKeyvSerialization(null);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = isKeyvSerialization(undefined);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = isKeyvSerialization("string");
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should return keyvSerialization: true for valid serialization adapter", () => {
			const adapter = {
				stringify: (obj: unknown) => JSON.stringify(obj),
				parse: (data: string) => JSON.parse(data),
			};
			const result = isKeyvSerialization(adapter);
			expect(result).toEqual({
				keyvSerialization: true,
				stringify: true,
				parse: true,
			});
		});

		test("should return keyvSerialization: false for object with only stringify", () => {
			const adapter = {
				stringify: (obj: unknown) => JSON.stringify(obj),
			};
			const result = isKeyvSerialization(adapter);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: true,
				parse: false,
			});
		});

		test("should return keyvSerialization: false for object with only parse", () => {
			const adapter = {
				parse: (data: string) => JSON.parse(data),
			};
			const result = isKeyvSerialization(adapter);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: true,
			});
		});

		test("should handle empty object", () => {
			const result = isKeyvSerialization({});
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should not detect properties that are not functions", () => {
			const obj = {
				stringify: "not a function",
				parse: "not a function",
			};
			const result = isKeyvSerialization(obj);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should detect JSON as serialization adapter", () => {
			const result = isKeyvSerialization(JSON);
			expect(result).toEqual({
				keyvSerialization: true,
				stringify: true,
				parse: true,
			});
		});

		test("should handle serialization adapter with additional properties", () => {
			const adapter = {
				stringify: (obj: unknown) => JSON.stringify(obj),
				parse: (data: string) => JSON.parse(data),
				compress: (data: string) => data,
				decompress: (data: string) => data,
			};
			const result = isKeyvSerialization(adapter);
			expect(result).toEqual({
				keyvSerialization: true,
				stringify: true,
				parse: true,
			});
		});
	});

	describe("isKeyvEncryption", () => {
		test("should return all false for null", () => {
			const result = isKeyvEncryption(null);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = isKeyvEncryption(undefined);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = isKeyvEncryption("string");
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should return keyvEncryption: true for valid encryption adapter", () => {
			const adapter = {
				encrypt: (data: string) => data,
				decrypt: (data: string) => data,
			};
			const result = isKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: true,
				encrypt: true,
				decrypt: true,
			});
		});

		test("should return keyvEncryption: false for object with only encrypt", () => {
			const adapter = {
				encrypt: (data: string) => data,
			};
			const result = isKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: true,
				decrypt: false,
			});
		});

		test("should return keyvEncryption: false for object with only decrypt", () => {
			const adapter = {
				decrypt: (data: string) => data,
			};
			const result = isKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: true,
			});
		});

		test("should handle empty object", () => {
			const result = isKeyvEncryption({});
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should not detect properties that are not functions", () => {
			const obj = {
				encrypt: "not a function",
				decrypt: "not a function",
			};
			const result = isKeyvEncryption(obj);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should detect async encryption functions", () => {
			const adapter = {
				encrypt: async (data: string) => data,
				decrypt: async (data: string) => data,
			};
			const result = isKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: true,
				encrypt: true,
				decrypt: true,
			});
		});

		test("should handle encryption adapter with additional properties", () => {
			const adapter = {
				encrypt: (data: string) => data,
				decrypt: (data: string) => data,
				algorithm: "AES-256-GCM",
				key: "secret-key",
			};
			const result = isKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: true,
				encrypt: true,
				decrypt: true,
			});
		});
	});
});
