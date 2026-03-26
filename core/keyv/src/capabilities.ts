export type KeyvCapability = {
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
};

export type MethodType = "sync" | "async" | "none";

export type KeyvStorageCapability = {
	keyvStorage: boolean;
	mapLike: boolean;
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
	methodTypes: Record<string, MethodType>;
};

export type KeyvCompressionCapability = {
	keyvCompression: boolean;
	compress: boolean;
	decompress: boolean;
};

export type KeyvSerializationCapability = {
	keyvSerialization: boolean;
	stringify: boolean;
	parse: boolean;
};

export type KeyvEncryptionCapability = {
	keyvEncryption: boolean;
	encrypt: boolean;
	decrypt: boolean;
};

export type CapabilitySpec = {
	methods: string[];
	properties: string[];
	requiredKeys: string[];
	compositeKey: string;
};

function isMethod(obj: object, name: string): boolean {
	return (
		name in obj && typeof (obj as Record<string, unknown>)[name] === "function"
	);
}

function isProperty(obj: object, name: string): boolean {
	return name in obj;
}

function resolveMethodType(obj: object, name: string): MethodType {
	if (!(name in obj)) {
		return "none";
	}

	const value = (obj as Record<string, unknown>)[name];
	if (typeof value !== "function") {
		return "none";
	}

	return value.constructor.name === "AsyncFunction" ? "async" : "sync";
}

/**
 * Generic capability detector that checks an object for the presence of methods and properties
 * @param obj - The object to check
 * @param spec - A {@link CapabilitySpec} describing which methods, properties, and required keys to check
 * @returns An object with boolean flags for each capability and a composite key indicating full compliance
 * @example
 * ```typescript
 * import { detectCapabilities } from 'keyv';
 *
 * const result = detectCapabilities(myObject, {
 *   methods: ['read', 'write'],
 *   properties: ['name'],
 *   requiredKeys: ['read', 'write', 'name'],
 *   compositeKey: 'isValid',
 * });
 * // { isValid: true/false, read: true/false, write: true/false, name: true/false }
 * ```
 */
export function detectCapabilities<T extends Record<string, boolean>>(
	obj: unknown,
	spec: CapabilitySpec,
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
		result[key] = isMethod(obj, key);
	}

	for (const key of spec.properties) {
		result[key] = isProperty(obj, key);
	}

	result[spec.compositeKey] = spec.requiredKeys.every((k) => result[k]);
	return result as T;
}

/**
 * Detect if an object is a Keyv instance or has Keyv-like capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each Keyv method/property
 * @example
 * ```typescript
 * import { detectKeyv } from 'keyv';
 *
 * detectKeyv(new Map());
 * // { keyv: false, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: false, setMany: false, deleteMany: false, hasMany: false,
 * //   disconnect: false, getRaw: false, getManyRaw: false, setRaw: false,
 * //   setManyRaw: false, hooks: false, stats: false, iterator: false }
 *
 * detectKeyv(new Keyv());
 * // { keyv: true, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: true, setMany: true, deleteMany: true, hasMany: true,
 * //   disconnect: true, getRaw: true, getManyRaw: true, setRaw: true,
 * //   setManyRaw: true, hooks: true, stats: true, iterator: true }
 * ```
 */
export function detectKeyv(obj: unknown): KeyvCapability {
	return detectCapabilities<KeyvCapability>(obj, {
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
			"iterator",
		],
		properties: ["hooks", "stats"],
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
		],
		compositeKey: "keyv",
	});
}

/**
 * Detect if an object is a Keyv storage adapter or has storage adapter-like capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each storage adapter method/property
 * @example
 * ```typescript
 * import { detectKeyvStorage } from 'keyv';
 *
 * detectKeyvStorage(new Map());
 * // { keyvStorage: false, mapLike: true, get: true, set: true, ... }
 *
 * const adapter = new KeyvRedis();
 * detectKeyvStorage(adapter);
 * // { keyvStorage: true, mapLike: false, get: true, set: true, ... }
 * ```
 */
export function detectKeyvStorage(obj: unknown): KeyvStorageCapability {
	const methodNames = [
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
	];
	const requiredKeys = [
		"get",
		"has",
		"hasMany",
		"set",
		"setMany",
		"delete",
		"deleteMany",
		"clear",
	];

	if (obj === null || obj === undefined || typeof obj !== "object") {
		const methodTypes: Record<string, MethodType> = {};
		for (const name of methodNames) {
			methodTypes[name] = "none";
		}

		return {
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
			methodTypes,
		};
	}

	const result: Record<string, boolean> = {};
	const methodTypes: Record<string, MethodType> = {};
	for (const name of methodNames) {
		result[name] = isMethod(obj, name);
		methodTypes[name] = resolveMethodType(obj, name);
	}

	const keyvStorage = requiredKeys.every((k) => result[k]);
	const mapLikeMethods = ["get", "set", "delete", "has", "entries", "keys"];
	const mapLike = mapLikeMethods.every(
		(m) => isMethod(obj, m) && resolveMethodType(obj, m) === "sync",
	);

	return {
		keyvStorage,
		mapLike,
		get: result.get,
		set: result.set,
		delete: result.delete,
		clear: result.clear,
		has: result.has,
		getMany: result.getMany,
		setMany: result.setMany,
		deleteMany: result.deleteMany,
		hasMany: result.hasMany,
		disconnect: result.disconnect,
		iterator: result.iterator,
		methodTypes,
	};
}

/**
 * Detect if an object is a Keyv compression adapter or has compression capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each compression method
 * @example
 * ```typescript
 * import { detectKeyvCompression } from 'keyv';
 *
 * const gzip = {
 *   compress: (data) => compressSync(data),
 *   decompress: (data) => decompressSync(data)
 * };
 * detectKeyvCompression(gzip);
 * // { keyvCompression: true, compress: true, decompress: true }
 *
 * detectKeyvCompression({});
 * // { keyvCompression: false, compress: false, decompress: false }
 * ```
 */
export function detectKeyvCompression(obj: unknown): KeyvCompressionCapability {
	const methods = ["compress", "decompress"];
	return detectCapabilities<KeyvCompressionCapability>(obj, {
		methods,
		properties: [],
		requiredKeys: methods,
		compositeKey: "keyvCompression",
	});
}

/**
 * Detect if an object is a Keyv serialization adapter or has serialization capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each serialization method
 * @example
 * ```typescript
 * import { detectKeyvSerialization } from 'keyv';
 *
 * const json = {
 *   stringify: (obj) => JSON.stringify(obj),
 *   parse: (str) => JSON.parse(str)
 * };
 * detectKeyvSerialization(json);
 * // { keyvSerialization: true, stringify: true, parse: true }
 *
 * detectKeyvSerialization({});
 * // { keyvSerialization: false, stringify: false, parse: false }
 * ```
 */
export function detectKeyvSerialization(
	obj: unknown,
): KeyvSerializationCapability {
	const methods = ["stringify", "parse"];
	return detectCapabilities<KeyvSerializationCapability>(obj, {
		methods,
		properties: [],
		requiredKeys: methods,
		compositeKey: "keyvSerialization",
	});
}

/**
 * Detect if an object is a Keyv encryption adapter or has encryption capabilities
 * @param obj - The object to check
 * @returns An object with boolean properties for each encryption method
 * @example
 * ```typescript
 * import { detectKeyvEncryption } from 'keyv';
 *
 * const aes = {
 *   encrypt: (data) => encryptAES(data),
 *   decrypt: (data) => decryptAES(data)
 * };
 * detectKeyvEncryption(aes);
 * // { keyvEncryption: true, encrypt: true, decrypt: true }
 *
 * detectKeyvEncryption({});
 * // { keyvEncryption: false, encrypt: false, decrypt: false }
 * ```
 */
export function detectKeyvEncryption(obj: unknown): KeyvEncryptionCapability {
	const methods = ["encrypt", "decrypt"];
	return detectCapabilities<KeyvEncryptionCapability>(obj, {
		methods,
		properties: [],
		requiredKeys: methods,
		compositeKey: "keyvEncryption",
	});
}
