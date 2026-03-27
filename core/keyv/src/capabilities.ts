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
	return name in obj && typeof (obj as Record<string, unknown>)[name] === "function";
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
 * Detect whether an object implements the full Keyv interface
 * @param obj - The object to check
 * @returns A {@link KeyvCapability} where `keyv` is `true` only when all required capabilities are present
 * @example
 * ```typescript
 * import Keyv, { detectKeyv } from 'keyv';
 *
 * const result = detectKeyv(new Keyv());
 * result.keyv; // true — all capabilities present
 *
 * const partial = detectKeyv(new Map());
 * partial.keyv; // false — missing getMany, setMany, hooks, stats, etc.
 * partial.get;  // true
 * partial.set;  // true
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
 * Detect whether an object implements the Keyv storage adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvStorageCapability} where:
 * - `keyvStorage` is `true` when get, set, delete, clear, has, setMany, deleteMany, and hasMany are present
 * - `mapLike` is `true` when the object has synchronous get, set, delete, has, entries, and keys methods
 * - `methodTypes` maps each method name to `"sync"`, `"async"`, or `"none"`
 * @example
 * ```typescript
 * import { detectKeyvStorage } from 'keyv';
 *
 * const map = detectKeyvStorage(new Map());
 * map.keyvStorage;        // false — missing setMany, deleteMany, hasMany
 * map.mapLike;            // true — synchronous get/set/delete/has/entries/keys
 * map.methodTypes.get;    // "sync"
 *
 * const adapter = detectKeyvStorage(asyncAdapter);
 * adapter.keyvStorage;    // true
 * adapter.mapLike;        // false — methods are async
 * adapter.methodTypes.get; // "async"
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
	const requiredKeys = ["get", "has", "hasMany", "set", "setMany", "delete", "deleteMany", "clear"];

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
 * Detect whether an object implements the Keyv compression adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvCompressionCapability} where `keyvCompression` is `true` when both `compress` and `decompress` methods are present
 * @example
 * ```typescript
 * import { detectKeyvCompression } from 'keyv';
 *
 * detectKeyvCompression({ compress: (d) => d, decompress: (d) => d });
 * // { keyvCompression: true, compress: true, decompress: true }
 *
 * detectKeyvCompression({ compress: (d) => d });
 * // { keyvCompression: false, compress: true, decompress: false }
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
 * Detect whether an object implements the Keyv serialization adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvSerializationCapability} where `keyvSerialization` is `true` when both `stringify` and `parse` methods are present
 * @example
 * ```typescript
 * import { detectKeyvSerialization } from 'keyv';
 *
 * detectKeyvSerialization(JSON);
 * // { keyvSerialization: true, stringify: true, parse: true }
 *
 * detectKeyvSerialization({ stringify: (o) => JSON.stringify(o) });
 * // { keyvSerialization: false, stringify: true, parse: false }
 * ```
 */
export function detectKeyvSerialization(obj: unknown): KeyvSerializationCapability {
	const methods = ["stringify", "parse"];
	return detectCapabilities<KeyvSerializationCapability>(obj, {
		methods,
		properties: [],
		requiredKeys: methods,
		compositeKey: "keyvSerialization",
	});
}

/**
 * Detect whether an object implements the Keyv encryption adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvEncryptionCapability} where `keyvEncryption` is `true` when both `encrypt` and `decrypt` methods are present
 * @example
 * ```typescript
 * import { detectKeyvEncryption } from 'keyv';
 *
 * detectKeyvEncryption({ encrypt: (d) => d, decrypt: (d) => d });
 * // { keyvEncryption: true, encrypt: true, decrypt: true }
 *
 * detectKeyvEncryption({ encrypt: (d) => d });
 * // { keyvEncryption: false, encrypt: true, decrypt: false }
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
