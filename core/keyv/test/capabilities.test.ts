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
		const allNoneMethods = {
			get: { exists: false, methodType: "none" },
			set: { exists: false, methodType: "none" },
			delete: { exists: false, methodType: "none" },
			clear: { exists: false, methodType: "none" },
			has: { exists: false, methodType: "none" },
			getMany: { exists: false, methodType: "none" },
			setMany: { exists: false, methodType: "none" },
			deleteMany: { exists: false, methodType: "none" },
			hasMany: { exists: false, methodType: "none" },
			disconnect: { exists: false, methodType: "none" },
			iterator: { exists: false, methodType: "none" },
		};

		test("should return all false for null", () => {
			const result = detectKeyvStorage(null);
			expect(result).toEqual({
				store: "none",
				methods: allNoneMethods,
			});
		});

		test("should return all false for undefined", () => {
			const result = detectKeyvStorage(undefined);
			expect(result).toEqual({
				store: "none",
				methods: allNoneMethods,
			});
		});

		test("should return all false for non-object types", () => {
			const result = detectKeyvStorage("string");
			expect(result).toEqual({
				store: "none",
				methods: allNoneMethods,
			});
		});

		test("should return store mapLike for new Map()", () => {
			const result = detectKeyvStorage(new Map());
			expect(result.store).toBe("mapLike"); // Sync get/set/delete/has
		});

		test("should detect Map capabilities correctly", () => {
			const result = detectKeyvStorage(new Map());
			expect(result).toEqual({
				store: "mapLike",
				methods: {
					get: { exists: true, methodType: "sync" },
					set: { exists: true, methodType: "sync" },
					delete: { exists: true, methodType: "sync" },
					clear: { exists: true, methodType: "sync" },
					has: { exists: true, methodType: "sync" },
					getMany: { exists: false, methodType: "none" },
					setMany: { exists: false, methodType: "none" },
					deleteMany: { exists: false, methodType: "none" },
					hasMany: { exists: false, methodType: "none" },
					disconnect: { exists: false, methodType: "none" },
					iterator: { exists: false, methodType: "none" },
				},
			});
		});

		test("should return store mapLike for Map with sync required methods added", () => {
			const store = Object.assign(new Map(), {
				hasMany: () => [],
				setMany: () => {},
				deleteMany: () => [],
			});
			const result = detectKeyvStorage(store);
			expect(result.store).toBe("mapLike"); // All sync, so mapLike not keyvStorage
			expect(result.methods.get.methodType).toBe("sync");
			expect(result.methods.set.methodType).toBe("sync");
			expect(result.methods.has.methodType).toBe("sync");
			expect(result.methods.hasMany.methodType).toBe("sync");
			expect(result.methods.setMany.methodType).toBe("sync");
			expect(result.methods.deleteMany.methodType).toBe("sync");
		});

		test("should return store asyncMap for object with only core async CRUD methods", () => {
			const adapter = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
			};
			const result = detectKeyvStorage(adapter);
			expect(result.store).toBe("asyncMap"); // Async get/set/delete/clear present
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
				store: "keyvStorage",
				methods: {
					get: { exists: true, methodType: "async" },
					set: { exists: true, methodType: "async" },
					delete: { exists: true, methodType: "async" },
					clear: { exists: true, methodType: "async" },
					has: { exists: true, methodType: "async" },
					getMany: { exists: true, methodType: "async" },
					setMany: { exists: true, methodType: "async" },
					deleteMany: { exists: true, methodType: "async" },
					hasMany: { exists: true, methodType: "async" },
					disconnect: { exists: true, methodType: "async" },
					iterator: { exists: true, methodType: "sync" },
				},
			});
		});

		test("should handle partial storage adapter objects with sync core methods", () => {
			const partialAdapter = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
			};
			const result = detectKeyvStorage(partialAdapter);
			expect(result.store).toBe("asyncMap"); // Has get/set/delete/clear but missing has so not mapLike
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
			expect(result.methods.delete.exists).toBe(true);
			expect(result.methods.clear.exists).toBe(true);
		});

		test("should detect objects with only some methods", () => {
			const obj = {
				get: () => {},
				set: () => {},
			};
			const result = detectKeyvStorage(obj);
			expect(result.store).toBe("none"); // Missing delete and clear
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
			expect(result.methods.delete.exists).toBe(false);
			expect(result.methods.clear.exists).toBe(false);
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
			expect(result.methods.get.exists).toBe(false);
			expect(result.methods.set.exists).toBe(false);
			expect(result.methods.delete.exists).toBe(false);
			expect(result.methods.clear.exists).toBe(false);
			expect(result.methods.has.exists).toBe(false);
			expect(result.methods.get.methodType).toBe("none");
		});

		test("should handle empty object", () => {
			const result = detectKeyvStorage({});
			expect(result).toEqual({
				store: "none",
				methods: allNoneMethods,
			});
		});

		test("should detect Keyv.store capabilities", () => {
			const keyv = new Keyv();
			const result = detectKeyvStorage(keyv.store);
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
			expect(result.methods.delete.exists).toBe(true);
			expect(result.methods.clear.exists).toBe(true);
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
			expect(result.methods.get.methodType).toBe("sync");
			expect(result.methods.set.methodType).toBe("sync");
			expect(result.methods.delete.methodType).toBe("sync");
			expect(result.methods.clear.methodType).toBe("sync");
			expect(result.methods.has.methodType).toBe("sync");
			expect(result.methods.getMany.methodType).toBe("none");
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
			expect(result.methods.get.methodType).toBe("async");
			expect(result.methods.set.methodType).toBe("async");
			expect(result.methods.delete.methodType).toBe("async");
			expect(result.methods.clear.methodType).toBe("async");
			expect(result.methods.has.methodType).toBe("async");
			expect(result.methods.getMany.methodType).toBe("none");
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
			expect(result.methods.get.methodType).toBe("async");
			expect(result.methods.set.methodType).toBe("sync");
			expect(result.methods.delete.methodType).toBe("async");
			expect(result.methods.clear.methodType).toBe("sync");
			expect(result.methods.has.methodType).toBe("async");
			expect(result.methods.setMany.methodType).toBe("sync");
			expect(result.methods.deleteMany.methodType).toBe("async");
			expect(result.methods.hasMany.methodType).toBe("sync");
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
