import { describe, expect, test } from "vitest";
import {
	detectKeyv,
	detectKeyvCompression,
	detectKeyvEncryption,
	detectKeyvSerialization,
	detectKeyvStorage,
} from "../src/capabilities.js";
import { Keyv } from "../src/index.js";

const allFalseKeyv = {
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
};

describe("capabilities", () => {
	describe("detectKeyv", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				expect(detectKeyv(input)).toEqual(allFalseKeyv);
			}
		});

		test("should detect Map capabilities (not a full Keyv)", () => {
			const result = detectKeyv(new Map());
			expect(result.keyv).toBe(false);
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(true);
			expect(result.clear).toBe(true);
			expect(result.has).toBe(true);
			expect(result.getMany).toBe(false);
		});

		test("should detect all capabilities on a Keyv instance", () => {
			const keyv = new Keyv();
			const result = detectKeyv(keyv);
			expect(result.keyv).toBe(true);
			expect(result.get).toBe(true);
			expect(result.set).toBe(true);
			expect(result.delete).toBe(true);
			expect(result.clear).toBe(true);
			expect(result.has).toBe(true);
			expect(result.getMany).toBe(true);
			expect(result.setMany).toBe(true);
			expect(result.deleteMany).toBe(true);
			expect(result.hasMany).toBe(true);
			expect(result.disconnect).toBe(true);
			expect(result.getRaw).toBe(true);
			expect(result.getManyRaw).toBe(true);
			expect(result.setRaw).toBe(true);
			expect(result.setManyRaw).toBe(true);
			expect(result.hooks).toBe(true);
			expect(result.stats).toBe(true);
			expect(result.iterator).toBe(true);
		});

		test("should detect Keyv with custom store", () => {
			const keyv = new Keyv({ store: new Map() });
			const result = detectKeyv(keyv);
			expect(result.keyv).toBe(true);
		});

		test("should handle partial objects and non-function properties", () => {
			// Partial Keyv-like object
			const partial = { get: () => {}, set: () => {}, delete: () => {}, clear: () => {} };
			const r1 = detectKeyv(partial);
			expect(r1.keyv).toBe(false);
			expect(r1.get).toBe(true);
			expect(r1.set).toBe(true);
			expect(r1.hooks).toBe(false);

			// Only some methods
			const r2 = detectKeyv({ get: () => {}, set: () => {} });
			expect(r2.keyv).toBe(false);
			expect(r2.get).toBe(true);
			expect(r2.delete).toBe(false);

			// Non-function properties are not detected
			const r3 = detectKeyv({ get: "not a function", set: "not a function" });
			expect(r3.get).toBe(false);
			expect(r3.set).toBe(false);

			// Partial many methods
			const r4 = detectKeyv({
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				getMany: () => {},
				hooks: {},
				stats: {},
			});
			expect(r4.keyv).toBe(false);
			expect(r4.getMany).toBe(true);
			expect(r4.setMany).toBe(false);
		});

		test("should detect hooks and stats as properties", () => {
			const obj = {
				get: () => {},
				set: () => {},
				delete: () => {},
				clear: () => {},
				hooks: {},
				stats: {},
			};
			const result = detectKeyv(obj);
			expect(result.hooks).toBe(true);
			expect(result.stats).toBe(true);
			expect(result.keyv).toBe(false);
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
			expect(detectKeyv(obj).keyv).toBe(true);
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

		test("should return store none for null, undefined, non-objects, and empty objects", () => {
			for (const input of [null, undefined, "string", {}]) {
				expect(detectKeyvStorage(input)).toEqual({ store: "none", methods: allNoneMethods });
			}
		});

		test("should detect Map as mapLike with sync methods", () => {
			const result = detectKeyvStorage(new Map());
			expect(result.store).toBe("mapLike");
			expect(result.methods.get).toEqual({ exists: true, methodType: "sync" });
			expect(result.methods.set).toEqual({ exists: true, methodType: "sync" });
			expect(result.methods.delete).toEqual({ exists: true, methodType: "sync" });
			expect(result.methods.clear).toEqual({ exists: true, methodType: "sync" });
			expect(result.methods.has).toEqual({ exists: true, methodType: "sync" });
			expect(result.methods.getMany).toEqual({ exists: false, methodType: "none" });
		});

		test("should detect Map with extra sync methods as mapLike", () => {
			const store = Object.assign(new Map(), {
				hasMany: () => [],
				setMany: () => {},
				deleteMany: () => [],
			});
			const result = detectKeyvStorage(store);
			expect(result.store).toBe("mapLike");
			expect(result.methods.hasMany.methodType).toBe("sync");
		});

		test("should detect async adapters and classify store types correctly", () => {
			// Core async CRUD only → asyncMap
			const asyncCore = {
				get: async () => {},
				set: async () => {},
				delete: async () => {},
				clear: async () => {},
			};
			expect(detectKeyvStorage(asyncCore).store).toBe("asyncMap");

			// Sync core without has → asyncMap (not mapLike)
			const syncNoHas = { get: () => {}, set: () => {}, delete: () => {}, clear: () => {} };
			expect(detectKeyvStorage(syncNoHas).store).toBe("asyncMap");

			// Full async adapter → keyvStorage
			const full = {
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
			const fullResult = detectKeyvStorage(full);
			expect(fullResult.store).toBe("keyvStorage");
			expect(fullResult.methods.get.methodType).toBe("async");
			expect(fullResult.methods.iterator.methodType).toBe("sync");
		});

		test("should return none for incomplete objects and non-function properties", () => {
			// Only some methods
			const r1 = detectKeyvStorage({ get: () => {}, set: () => {} });
			expect(r1.store).toBe("none");
			expect(r1.methods.get.exists).toBe(true);
			expect(r1.methods.delete.exists).toBe(false);

			// Non-function properties
			const r2 = detectKeyvStorage({ get: "not a function", set: "not a function" });
			expect(r2.methods.get.exists).toBe(false);
			expect(r2.methods.get.methodType).toBe("none");
		});

		test("should detect Keyv.store capabilities", () => {
			const keyv = new Keyv();
			const result = detectKeyvStorage(keyv.store);
			expect(result.methods.get.exists).toBe(true);
			expect(result.methods.set.exists).toBe(true);
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
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			const expected = { keyvCompression: false, compress: false, decompress: false };
			for (const input of [null, undefined, "string", {}]) {
				expect(detectKeyvCompression(input)).toEqual(expected);
			}
		});

		test("should detect valid compression adapter and partial adapters", () => {
			// Valid adapter
			const valid = { compress: (d: string) => d, decompress: (d: string) => d };
			expect(detectKeyvCompression(valid)).toEqual({
				keyvCompression: true,
				compress: true,
				decompress: true,
			});

			// Only compress
			expect(detectKeyvCompression({ compress: (d: string) => d })).toEqual({
				keyvCompression: false,
				compress: true,
				decompress: false,
			});

			// Only decompress
			expect(detectKeyvCompression({ decompress: (d: string) => d })).toEqual({
				keyvCompression: false,
				compress: false,
				decompress: true,
			});
		});

		test("should handle non-function properties, async functions, and extra properties", () => {
			// Non-function
			expect(
				detectKeyvCompression({ compress: "not a function", decompress: "not a function" }),
			).toEqual({ keyvCompression: false, compress: false, decompress: false });

			// Async functions
			expect(
				detectKeyvCompression({
					compress: async (d: string) => d,
					decompress: async (d: string) => d,
				}),
			).toEqual({ keyvCompression: true, compress: true, decompress: true });

			// Extra properties are ignored
			const extra = {
				compress: (d: string) => d,
				decompress: (d: string) => d,
				serialize: () => {},
			};
			expect(detectKeyvCompression(extra).keyvCompression).toBe(true);
		});
	});

	describe("detectKeyvSerialization", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			const expected = { keyvSerialization: false, stringify: false, parse: false };
			for (const input of [null, undefined, "string", {}]) {
				expect(detectKeyvSerialization(input)).toEqual(expected);
			}
		});

		test("should detect valid serialization adapter and partial adapters", () => {
			const valid = {
				stringify: (o: unknown) => JSON.stringify(o),
				parse: (d: string) => JSON.parse(d),
			};
			expect(detectKeyvSerialization(valid)).toEqual({
				keyvSerialization: true,
				stringify: true,
				parse: true,
			});

			expect(detectKeyvSerialization({ stringify: (o: unknown) => JSON.stringify(o) })).toEqual({
				keyvSerialization: false,
				stringify: true,
				parse: false,
			});

			expect(detectKeyvSerialization({ parse: (d: string) => JSON.parse(d) })).toEqual({
				keyvSerialization: false,
				stringify: false,
				parse: true,
			});
		});

		test("should handle non-function properties, JSON object, and extra properties", () => {
			expect(
				detectKeyvSerialization({ stringify: "not a function", parse: "not a function" }),
			).toEqual({ keyvSerialization: false, stringify: false, parse: false });

			expect(detectKeyvSerialization(JSON)).toEqual({
				keyvSerialization: true,
				stringify: true,
				parse: true,
			});

			const extra = {
				stringify: (o: unknown) => JSON.stringify(o),
				parse: (d: string) => JSON.parse(d),
				compress: () => {},
			};
			expect(detectKeyvSerialization(extra).keyvSerialization).toBe(true);
		});
	});

	describe("detectKeyvEncryption", () => {
		test("should return all false for null, undefined, non-objects, and empty objects", () => {
			const expected = { keyvEncryption: false, encrypt: false, decrypt: false };
			for (const input of [null, undefined, "string", {}]) {
				expect(detectKeyvEncryption(input)).toEqual(expected);
			}
		});

		test("should detect valid encryption adapter and partial adapters", () => {
			const valid = { encrypt: (d: string) => d, decrypt: (d: string) => d };
			expect(detectKeyvEncryption(valid)).toEqual({
				keyvEncryption: true,
				encrypt: true,
				decrypt: true,
			});

			expect(detectKeyvEncryption({ encrypt: (d: string) => d })).toEqual({
				keyvEncryption: false,
				encrypt: true,
				decrypt: false,
			});

			expect(detectKeyvEncryption({ decrypt: (d: string) => d })).toEqual({
				keyvEncryption: false,
				encrypt: false,
				decrypt: true,
			});
		});

		test("should handle non-function properties, async functions, and extra properties", () => {
			expect(
				detectKeyvEncryption({ encrypt: "not a function", decrypt: "not a function" }),
			).toEqual({ keyvEncryption: false, encrypt: false, decrypt: false });

			expect(
				detectKeyvEncryption({ encrypt: async (d: string) => d, decrypt: async (d: string) => d }),
			).toEqual({ keyvEncryption: true, encrypt: true, decrypt: true });

			const extra = { encrypt: (d: string) => d, decrypt: (d: string) => d, algorithm: "AES" };
			expect(detectKeyvEncryption(extra).keyvEncryption).toBe(true);
		});
	});
});
