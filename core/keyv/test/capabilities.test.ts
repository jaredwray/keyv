import { describe, expect, test } from "vitest";
import {
	detectKeyv,
	detectKeyvCompression,
	detectKeyvEncryption,
	detectKeyvSerialization,
	detectKeyvStorage,
} from "../src/capabilities.js";
import { Keyv } from "../src/index.js";

describe("capabilities", () => {
	describe("detectKeyv", () => {
		test("should return all false for null", () => {
			const result = detectKeyv(null);
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
				setRaw: false,
				setManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = detectKeyv(undefined);
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
				setRaw: false,
				setManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = detectKeyv("string");
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
				setRaw: false,
				setManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return keyv: false for new Map()", () => {
			const result = detectKeyv(new Map());
			expect(result.keyv).toBe(false);
		});

		test("should detect Map capabilities correctly", () => {
			const result = detectKeyv(new Map());
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
				setRaw: false,
				setManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should return keyv: true for Keyv instance", () => {
			const keyv = new Keyv();
			const result = detectKeyv(keyv);
			expect(result.keyv).toBe(true);
		});

		test("should detect all Keyv capabilities", () => {
			const keyv = new Keyv();
			const result = detectKeyv(keyv);
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
				setRaw: true,
				setManyRaw: true,
				hooks: true,
				stats: true,
				iterator: true, // Iterator is present for Map store
			});
		});

		test("should detect iterator capability when present", () => {
			const keyv = new Keyv();
			const result = detectKeyv(keyv);
			expect(result.iterator).toBe(true);
		});

		test("should handle partial Keyv-like objects", () => {
			const partialKeyv = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
			};
			const result = detectKeyv(partialKeyv);
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
			const result = detectKeyv(obj);
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
			const result = detectKeyv(obj);
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
			const result = detectKeyv(obj);
			expect(result.keyv).toBe(false); // Missing many required methods
			expect(result.hooks).toBe(true);
			expect(result.stats).toBe(true);
		});

		test("should return keyv: false when missing many required capabilities", () => {
			const obj = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				hooks: {},
				stats: {},
			};
			const result = detectKeyv(obj);
			expect(result.keyv).toBe(false); // Missing has, getMany, setMany, deleteMany, hasMany, disconnect, getRaw, getManyRaw, setRaw, setManyRaw, iterator
		});

		test("should return keyv: true when all required properties are present", () => {
			const obj = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				has: () => {},
				getMany: () => {},
				setMany: () => {},
				deleteMany: () => {},
				hasMany: () => {},
				disconnect: () => {},
				getRaw: () => {},
				getManyRaw: () => {},
				setRaw: () => {},
				setManyRaw: () => {},
				hooks: {},
				stats: {},
				iterator: () => {},
			};
			const result = detectKeyv(obj);
			expect(result.keyv).toBe(true); // Has all required capabilities
		});

		test("should handle empty object", () => {
			const result = detectKeyv({});
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
				setRaw: false,
				setManyRaw: false,
				hooks: false,
				stats: false,
				iterator: false,
			});
		});

		test("should detect Keyv with custom store", () => {
			const customStore = new Map();
			const keyv = new Keyv({ store: customStore });
			const result = detectKeyv(keyv);
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
			const result = detectKeyv(obj);
			expect(result.keyv).toBe(false); // Missing has, setMany, deleteMany, hasMany, disconnect, getRaw, getManyRaw, setRaw, setManyRaw, iterator
			expect(result.getMany).toBe(true);
			expect(result.setMany).toBe(false);
			expect(result.deleteMany).toBe(false);
			expect(result.hasMany).toBe(false);
		});
	});

	describe("detectKeyvStorage", () => {
		const allNoneMethodTypes = {
			get: "none",
			set: "none",
			delete: "none",
			clear: "none",
			has: "none",
			getMany: "none",
			setMany: "none",
			deleteMany: "none",
			hasMany: "none",
			disconnect: "none",
			iterator: "none",
		};

		test("should return all false for null", () => {
			const result = detectKeyvStorage(null);
			expect(result).toEqual({
				keyvStorage: false,
				mapLike: false,
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
				methodTypes: allNoneMethodTypes,
			});
		});

		test("should return all false for undefined", () => {
			const result = detectKeyvStorage(undefined);
			expect(result).toEqual({
				keyvStorage: false,
				mapLike: false,
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
				methodTypes: allNoneMethodTypes,
			});
		});

		test("should return all false for non-object types", () => {
			const result = detectKeyvStorage("string");
			expect(result).toEqual({
				keyvStorage: false,
				mapLike: false,
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
				methodTypes: allNoneMethodTypes,
			});
		});

		test("should return keyvStorage: false and mapLike: true for new Map()", () => {
			const result = detectKeyvStorage(new Map());
			expect(result.keyvStorage).toBe(false); // Missing setMany, deleteMany, hasMany
			expect(result.mapLike).toBe(true);
		});

		test("should detect Map capabilities correctly", () => {
			const result = detectKeyvStorage(new Map());
			expect(result).toEqual({
				keyvStorage: false, // Missing setMany, deleteMany, hasMany
				mapLike: true,
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
				methodTypes: {
					get: "sync",
					set: "sync",
					delete: "sync",
					clear: "sync",
					has: "sync",
					getMany: "none",
					setMany: "none",
					deleteMany: "none",
					hasMany: "none",
					disconnect: "none",
					iterator: "none",
				},
			});
		});

		test("should return keyvStorage: true for Map with required methods added", () => {
			const store = Object.assign(new Map(), {
				hasMany: () => [],
				setMany: () => {},
				deleteMany: () => [],
			});
			const result = detectKeyvStorage(store);
			expect(result.keyvStorage).toBe(true);
			expect(result.mapLike).toBe(true);
			expect(result.methodTypes.get).toBe("sync");
			expect(result.methodTypes.set).toBe("sync");
			expect(result.methodTypes.has).toBe("sync");
			expect(result.methodTypes.hasMany).toBe("sync");
			expect(result.methodTypes.setMany).toBe("sync");
			expect(result.methodTypes.deleteMany).toBe("sync");
		});

		test("should return keyvStorage: false for object with only core CRUD methods", () => {
			const adapter = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
			};
			const result = detectKeyvStorage(adapter);
			expect(result.keyvStorage).toBe(false); // Missing has, setMany, deleteMany, hasMany
			expect(result.mapLike).toBe(false);
		});

		test("should detect all storage adapter capabilities", () => {
			const adapter = {
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
			const result = detectKeyvStorage(adapter);
			expect(result).toEqual({
				keyvStorage: true,
				mapLike: false,
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
				methodTypes: {
					get: "async",
					set: "async",
					delete: "async",
					clear: "async",
					has: "async",
					getMany: "async",
					setMany: "async",
					deleteMany: "async",
					hasMany: "async",
					disconnect: "async",
					iterator: "sync",
				},
			});
		});

		test("should handle partial storage adapter objects with core methods", () => {
			const partialAdapter = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
			};
			const result = detectKeyvStorage(partialAdapter);
			expect(result.keyvStorage).toBe(false); // Missing has, setMany, deleteMany, hasMany
			expect(result.mapLike).toBe(false);
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
			const result = detectKeyvStorage(obj);
			expect(result.keyvStorage).toBe(false); // Missing delete and clear
			expect(result.mapLike).toBe(false);
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
			const result = detectKeyvStorage(obj);
			expect(result.get).toBe(false);
			expect(result.set).toBe(false);
			expect(result.delete).toBe(false);
			expect(result.clear).toBe(false);
			expect(result.has).toBe(false);
			expect(result.methodTypes.get).toBe("none");
		});

		test("should handle empty object", () => {
			const result = detectKeyvStorage({});
			expect(result).toEqual({
				keyvStorage: false,
				mapLike: false,
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
				methodTypes: allNoneMethodTypes,
			});
		});

		test("should detect Keyv.store capabilities", () => {
			const keyv = new Keyv();
			const result = detectKeyvStorage(keyv.store);
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(true);
			expect(result.clear).toBe(true);
		});

		test("should detect sync method types", () => {
			const adapter = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				has: () => {},
				setMany: () => {},
				deleteMany: () => {},
				hasMany: () => {},
			};
			const result = detectKeyvStorage(adapter);
			expect(result.methodTypes.get).toBe("sync");
			expect(result.methodTypes.set).toBe("sync");
			expect(result.methodTypes.delete).toBe("sync");
			expect(result.methodTypes.clear).toBe("sync");
			expect(result.methodTypes.has).toBe("sync");
			expect(result.methodTypes.getMany).toBe("none");
		});

		test("should detect async method types", () => {
			const adapter = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
				has: async () => {},
				setMany: async () => {},
				deleteMany: async () => {},
				hasMany: async () => {},
			};
			const result = detectKeyvStorage(adapter);
			expect(result.methodTypes.get).toBe("async");
			expect(result.methodTypes.set).toBe("async");
			expect(result.methodTypes.delete).toBe("async");
			expect(result.methodTypes.clear).toBe("async");
			expect(result.methodTypes.has).toBe("async");
			expect(result.methodTypes.getMany).toBe("none");
		});

		test("should detect mixed sync and async method types", () => {
			const adapter = {
				get: async () => {},
				set: () => {},
				delete: async () => {},
				clear: () => {},
				has: async () => {},
				setMany: () => {},
				deleteMany: async () => {},
				hasMany: () => {},
			};
			const result = detectKeyvStorage(adapter);
			expect(result.methodTypes.get).toBe("async");
			expect(result.methodTypes.set).toBe("sync");
			expect(result.methodTypes.delete).toBe("async");
			expect(result.methodTypes.clear).toBe("sync");
			expect(result.methodTypes.has).toBe("async");
			expect(result.methodTypes.setMany).toBe("sync");
			expect(result.methodTypes.deleteMany).toBe("async");
			expect(result.methodTypes.hasMany).toBe("sync");
		});
	});

	describe("detectKeyvCompression", () => {
		test("should return all false for null", () => {
			const result = detectKeyvCompression(null);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = detectKeyvCompression(undefined);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = detectKeyvCompression("string");
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
			const result = detectKeyvCompression(adapter);
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
			const result = detectKeyvCompression(adapter);
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
			const result = detectKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: true,
			});
		});

		test("should handle empty object", () => {
			const result = detectKeyvCompression({});
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
			const result = detectKeyvCompression(obj);
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
			const result = detectKeyvCompression(adapter);
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
			const result = detectKeyvCompression(adapter);
			expect(result).toEqual({
				keyvCompression: true,
				compress: true,
				decompress: true,
			});
		});
	});

	describe("detectKeyvSerialization", () => {
		test("should return all false for null", () => {
			const result = detectKeyvSerialization(null);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = detectKeyvSerialization(undefined);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = detectKeyvSerialization("string");
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
			const result = detectKeyvSerialization(adapter);
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
			const result = detectKeyvSerialization(adapter);
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
			const result = detectKeyvSerialization(adapter);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: true,
			});
		});

		test("should handle empty object", () => {
			const result = detectKeyvSerialization({});
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
			const result = detectKeyvSerialization(obj);
			expect(result).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: false,
			});
		});

		test("should detect JSON as serialization adapter", () => {
			const result = detectKeyvSerialization(JSON);
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
			const result = detectKeyvSerialization(adapter);
			expect(result).toEqual({
				keyvSerialization: true,
				stringify: true,
				parse: true,
			});
		});
	});

	describe("detectKeyvEncryption", () => {
		test("should return all false for null", () => {
			const result = detectKeyvEncryption(null);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should return all false for undefined", () => {
			const result = detectKeyvEncryption(undefined);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: false,
			});
		});

		test("should return all false for non-object types", () => {
			const result = detectKeyvEncryption("string");
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
			const result = detectKeyvEncryption(adapter);
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
			const result = detectKeyvEncryption(adapter);
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
			const result = detectKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: true,
			});
		});

		test("should handle empty object", () => {
			const result = detectKeyvEncryption({});
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
			const result = detectKeyvEncryption(obj);
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
			const result = detectKeyvEncryption(adapter);
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
			const result = detectKeyvEncryption(adapter);
			expect(result).toEqual({
				keyvEncryption: true,
				encrypt: true,
				decrypt: true,
			});
		});
	});
});
