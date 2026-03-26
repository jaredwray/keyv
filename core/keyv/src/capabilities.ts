export type IsKeyvResult = {
	keyv: boolean;
	get: boolean;
	set: boolean;
	delete: boolean;
	clear: boolean;
	has: boolean;
	getMany: boolean;
	setMany: boolean;
	deleteMany: boolean;
	hasMany: boolean;
	disconnect: boolean;
	getRaw: boolean;
	getManyRaw: boolean;
	setRaw: boolean;
	setManyRaw: boolean;
	hooks: boolean;
	stats: boolean;
	iterator: boolean;
	namespace: boolean;
};

export type IsKeyvStorageResult = {
	keyvStorage: boolean;
	get: boolean;
	set: boolean;
	delete: boolean;
	clear: boolean;
	has: boolean;
	getMany: boolean;
	setMany: boolean;
	deleteMany: boolean;
	hasMany: boolean;
	disconnect: boolean;
	iterator: boolean;
};

export type IsKeyvCompressionResult = {
	keyvCompression: boolean;
	compress: boolean;
	decompress: boolean;
};

export type IsKeyvSerializationResult = {
	keyvSerialization: boolean;
	stringify: boolean;
	parse: boolean;
};

export type IsKeyvEncryptionResult = {
	keyvEncryption: boolean;
	encrypt: boolean;
	decrypt: boolean;
};

export type CheckCapabilitiesSpec = {
	methods: string[];
	properties: string[];
	requiredKeys: string[];
	compositeKey: string;
};

function hasMethod(obj: object, name: string): boolean {
	return (
		name in obj && typeof (obj as Record<string, unknown>)[name] === "function"
	);
}

function hasProp(obj: object, name: string): boolean {
	return name in obj;
}

function checkCapabilities<T extends Record<string, boolean>>(
	obj: unknown,
	spec: CheckCapabilitiesSpec,
): T {
	const allKeys = [spec.compositeKey, ...spec.methods, ...spec.properties];

	if (obj === null || obj === undefined || typeof obj !== "object") {
		const result: Record<string, boolean> = {};
		for (const key of allKeys) {
			result[key] = false;
		}

		return result as T;
	}

	const result: Record<string, boolean> = {};
	for (const key of spec.methods) {
		result[key] = hasMethod(obj, key);
	}

	for (const key of spec.properties) {
		result[key] = hasProp(obj, key);
	}

	result[spec.compositeKey] = spec.requiredKeys.every((k) => result[k]);
	return result as T;
}

/**
 * Check if an object is a Keyv instance or has Keyv-like capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each Keyv method/property
 * @example
 * ```typescript
 * import { isKeyv } from 'keyv';
 *
 * isKeyv(new Map());
 * // { keyv: false, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: false, setMany: false, deleteMany: false, hasMany: false,
 * //   disconnect: false, getRaw: false, getManyRaw: false, setRaw: false,
 * //   setManyRaw: false, hooks: false, stats: false, iterator: false }
 *
 * isKeyv(new Keyv());
 * // { keyv: true, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: true, setMany: true, deleteMany: true, hasMany: true,
 * //   disconnect: true, getRaw: true, getManyRaw: true, setRaw: true,
 * //   setManyRaw: true, hooks: true, stats: true, iterator: false }
 * ```
 */
export function isKeyv(obj: unknown): IsKeyvResult {
	return checkCapabilities<IsKeyvResult>(obj, {
		methods: [
			"get",
			"set",
			"delete",
			"clear",
			"has",
			"getMany",
			"setMany",
			"deleteMany",
			"hasMany",
			"disconnect",
			"getRaw",
			"getManyRaw",
			"setRaw",
			"setManyRaw",
		],
		properties: ["hooks", "stats", "iterator", "namespace"],
		requiredKeys: [
			"get",
			"set",
			"delete",
			"clear",
			"has",
			"getMany",
			"setMany",
			"deleteMany",
			"hasMany",
			"disconnect",
			"getRaw",
			"getManyRaw",
			"setRaw",
			"setManyRaw",
			"hooks",
			"stats",
			"iterator",
			"namespace",
		],
		compositeKey: "keyv",
	});
}

/**
 * Check if an object is a Keyv storage adapter or has storage adapter-like capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each storage adapter method/property
 * @example
 * ```typescript
 * import { isKeyvStorage } from 'keyv';
 *
 * isKeyvStorage(new Map());
 * // { keyvStorage: false, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: false, setMany: false, deleteMany: false, hasMany: false,
 * //   disconnect: false, iterator: false, namespace: false }
 *
 * const adapter = new KeyvRedis();
 * isKeyvStorage(adapter);
 * // { keyvStorage: true, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: true, setMany: true, deleteMany: true, hasMany: true,
 * //   disconnect: true, iterator: true, namespace: true }
 * ```
 */
export function isKeyvStorage(obj: unknown): IsKeyvStorageResult {
	return checkCapabilities<IsKeyvStorageResult>(obj, {
		methods: [
			"get",
			"set",
			"delete",
			"clear",
			"has",
			"getMany",
			"setMany",
			"deleteMany",
			"hasMany",
			"disconnect",
			"iterator",
		],
		properties: [],
		requiredKeys: ["get", "set", "delete", "clear"],
		compositeKey: "keyvStorage",
	});
}

/**
 * Check if an object is a Keyv compression adapter or has compression capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each compression method
 * @example
 * ```typescript
 * import { isKeyvCompression } from 'keyv';
 *
 * const gzip = {
 *   compress: (data) => compressSync(data),
 *   decompress: (data) => decompressSync(data)
 * };
 * isKeyvCompression(gzip);
 * // { keyvCompression: true, compress: true, decompress: true }
 *
 * isKeyvCompression({});
 * // { keyvCompression: false, compress: false, decompress: false }
 * ```
 */
export function isKeyvCompression(obj: unknown): IsKeyvCompressionResult {
	return checkCapabilities<IsKeyvCompressionResult>(obj, {
		methods: ["compress", "decompress"],
		properties: [],
		requiredKeys: ["compress", "decompress"],
		compositeKey: "keyvCompression",
	});
}

/**
 * Check if an object is a Keyv serialization adapter or has serialization capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each serialization method
 * @example
 * ```typescript
 * import { isKeyvSerialization } from 'keyv';
 *
 * const json = {
 *   stringify: (obj) => JSON.stringify(obj),
 *   parse: (str) => JSON.parse(str)
 * };
 * isKeyvSerialization(json);
 * // { keyvSerialization: true, stringify: true, parse: true }
 *
 * isKeyvSerialization({});
 * // { keyvSerialization: false, stringify: false, parse: false }
 * ```
 */
export function isKeyvSerialization(obj: unknown): IsKeyvSerializationResult {
	return checkCapabilities<IsKeyvSerializationResult>(obj, {
		methods: ["stringify", "parse"],
		properties: [],
		requiredKeys: ["stringify", "parse"],
		compositeKey: "keyvSerialization",
	});
}

/**
 * Check if an object is a Keyv encryption adapter or has encryption capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each encryption method
 * @example
 * ```typescript
 * import { isKeyvEncryption } from 'keyv';
 *
 * const aes = {
 *   encrypt: (data) => encryptAES(data),
 *   decrypt: (data) => decryptAES(data)
 * };
 * isKeyvEncryption(aes);
 * // { keyvEncryption: true, encrypt: true, decrypt: true }
 *
 * isKeyvEncryption({});
 * // { keyvEncryption: false, encrypt: false, decrypt: false }
 * ```
 */
export function isKeyvEncryption(obj: unknown): IsKeyvEncryptionResult {
	return checkCapabilities<IsKeyvEncryptionResult>(obj, {
		methods: ["encrypt", "decrypt"],
		properties: [],
		requiredKeys: ["encrypt", "decrypt"],
		compositeKey: "keyvEncryption",
	});
}
