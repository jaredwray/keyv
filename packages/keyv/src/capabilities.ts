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
	hooks: boolean;
	stats: boolean;
	iterator: boolean;
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
	namespace: boolean;
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
 * //   disconnect: false, getRaw: false, getManyRaw: false, hooks: false,
 * //   stats: false, iterator: false }
 *
 * isKeyv(new Keyv());
 * // { keyv: true, get: true, set: true, delete: true, clear: true, has: true,
 * //   getMany: true, setMany: true, deleteMany: true, hasMany: true,
 * //   disconnect: true, getRaw: true, getManyRaw: true, hooks: true,
 * //   stats: true, iterator: false }
 * ```
 */
export function isKeyv(obj: unknown): IsKeyvResult {
	if (obj === null || obj === undefined) {
		return {
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
		};
	}

	if (typeof obj !== "object") {
		return {
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
		};
	}

	// Check for each method/property
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasGet = "get" in obj && typeof (obj as any).get === "function";
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasSet = "set" in obj && typeof (obj as any).set === "function";
	const hasDelete =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"delete" in obj && typeof (obj as any).delete === "function";
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasClear = "clear" in obj && typeof (obj as any).clear === "function";
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasHas = "has" in obj && typeof (obj as any).has === "function";
	const hasGetMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"getMany" in obj && typeof (obj as any).getMany === "function";
	const hasSetMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"setMany" in obj && typeof (obj as any).setMany === "function";
	const hasDeleteMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"deleteMany" in obj && typeof (obj as any).deleteMany === "function";
	const hasHasMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"hasMany" in obj && typeof (obj as any).hasMany === "function";
	const hasDisconnect =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"disconnect" in obj && typeof (obj as any).disconnect === "function";
	const hasGetRaw =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"getRaw" in obj && typeof (obj as any).getRaw === "function";
	const hasGetManyRaw =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"getManyRaw" in obj && typeof (obj as any).getManyRaw === "function";
	const hasHooks = "hooks" in obj;
	const hasStats = "stats" in obj;
	const hasIterator = "iterator" in obj;

	// Determine if it's a Keyv instance based on core methods and properties
	const isKeyvInstance =
		hasGet && hasSet && hasDelete && hasClear && hasHooks && hasStats;

	return {
		keyv: isKeyvInstance,
		get: hasGet,
		set: hasSet,
		delete: hasDelete,
		clear: hasClear,
		has: hasHas,
		getMany: hasGetMany,
		setMany: hasSetMany,
		deleteMany: hasDeleteMany,
		hasMany: hasHasMany,
		disconnect: hasDisconnect,
		getRaw: hasGetRaw,
		getManyRaw: hasGetManyRaw,
		hooks: hasHooks,
		stats: hasStats,
		iterator: hasIterator,
	};
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
	if (obj === null || obj === undefined) {
		return {
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
		};
	}

	if (typeof obj !== "object") {
		return {
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
		};
	}

	// Check for each method/property
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasGet = "get" in obj && typeof (obj as any).get === "function";
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasSet = "set" in obj && typeof (obj as any).set === "function";
	const hasDelete =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"delete" in obj && typeof (obj as any).delete === "function";
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasClear = "clear" in obj && typeof (obj as any).clear === "function";
	// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
	const hasHas = "has" in obj && typeof (obj as any).has === "function";
	const hasGetMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"getMany" in obj && typeof (obj as any).getMany === "function";
	const hasSetMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"setMany" in obj && typeof (obj as any).setMany === "function";
	const hasDeleteMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"deleteMany" in obj && typeof (obj as any).deleteMany === "function";
	const hasHasMany =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"hasMany" in obj && typeof (obj as any).hasMany === "function";
	const hasDisconnect =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"disconnect" in obj && typeof (obj as any).disconnect === "function";
	const hasIterator =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"iterator" in obj && typeof (obj as any).iterator === "function";
	const hasNamespace = "namespace" in obj;

	// Determine if it's a Keyv storage adapter based on core methods
	// Must have: get, set, delete, clear (core required methods)
	const isKeyvStorageAdapter = hasGet && hasSet && hasDelete && hasClear;

	return {
		keyvStorage: isKeyvStorageAdapter,
		get: hasGet,
		set: hasSet,
		delete: hasDelete,
		clear: hasClear,
		has: hasHas,
		getMany: hasGetMany,
		setMany: hasSetMany,
		deleteMany: hasDeleteMany,
		hasMany: hasHasMany,
		disconnect: hasDisconnect,
		iterator: hasIterator,
		namespace: hasNamespace,
	};
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
	if (obj === null || obj === undefined) {
		return {
			keyvCompression: false,
			compress: false,
			decompress: false,
		};
	}

	if (typeof obj !== "object") {
		return {
			keyvCompression: false,
			compress: false,
			decompress: false,
		};
	}

	// Check for compress and decompress methods
	const hasCompress =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"compress" in obj && typeof (obj as any).compress === "function";
	const hasDecompress =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"decompress" in obj && typeof (obj as any).decompress === "function";

	// Determine if it's a Keyv compression adapter
	// Must have both compress and decompress methods
	const isKeyvCompressionAdapter = hasCompress && hasDecompress;

	return {
		keyvCompression: isKeyvCompressionAdapter,
		compress: hasCompress,
		decompress: hasDecompress,
	};
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
	if (obj === null || obj === undefined) {
		return {
			keyvSerialization: false,
			stringify: false,
			parse: false,
		};
	}

	if (typeof obj !== "object") {
		return {
			keyvSerialization: false,
			stringify: false,
			parse: false,
		};
	}

	// Check for stringify and parse methods
	const hasStringify =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"stringify" in obj && typeof (obj as any).stringify === "function";
	const hasParse =
		// biome-ignore lint/suspicious/noExplicitAny: need to check unknown object properties
		"parse" in obj && typeof (obj as any).parse === "function";

	// Determine if it's a Keyv serialization adapter
	// Must have both stringify and parse methods
	const isKeyvSerializationAdapter = hasStringify && hasParse;

	return {
		keyvSerialization: isKeyvSerializationAdapter,
		stringify: hasStringify,
		parse: hasParse,
	};
}
