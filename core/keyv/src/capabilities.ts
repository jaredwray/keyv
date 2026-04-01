export type MethodType = "sync" | "async" | "none";

export type KeyvStorageMethod = {
	exists: boolean;
	methodType: MethodType;
};

// --- Keyv (full interface) ---

export type KeyvMethods = {
	get: KeyvStorageMethod;
	set: KeyvStorageMethod;
	delete: KeyvStorageMethod;
	clear: KeyvStorageMethod;
	has: KeyvStorageMethod;
	getMany: KeyvStorageMethod;
	setMany: KeyvStorageMethod;
	deleteMany: KeyvStorageMethod;
	hasMany: KeyvStorageMethod;
	disconnect: KeyvStorageMethod;
	getRaw: KeyvStorageMethod;
	getManyRaw: KeyvStorageMethod;
	setRaw: KeyvStorageMethod;
	setManyRaw: KeyvStorageMethod;
	iterator: KeyvStorageMethod;
};

export type KeyvProperties = {
	hooks: boolean;
	stats: boolean;
};

export type KeyvCapability = {
	compatible: boolean;
	methods: KeyvMethods;
	properties: KeyvProperties;
};

// --- Storage adapter ---

export type KeyvStorageMethods = {
	get: KeyvStorageMethod;
	getMany: KeyvStorageMethod;
	has: KeyvStorageMethod;
	hasMany: KeyvStorageMethod;
	set: KeyvStorageMethod;
	setMany: KeyvStorageMethod;
	delete: KeyvStorageMethod;
	deleteMany: KeyvStorageMethod;
	clear: KeyvStorageMethod;
	disconnect: KeyvStorageMethod;
	iterator: KeyvStorageMethod;
};

export type KeyvStorageCapability = {
	compatible: boolean;
	store: "mapLike" | "keyvStorage" | "asyncMap" | "none";
	methods: KeyvStorageMethods;
};

// --- Compression adapter ---

export type KeyvCompressionMethods = {
	compress: KeyvStorageMethod;
	decompress: KeyvStorageMethod;
};

export type KeyvCompressionCapability = {
	compatible: boolean;
	methods: KeyvCompressionMethods;
};

// --- Serialization adapter ---

export type KeyvSerializationMethods = {
	stringify: KeyvStorageMethod;
	parse: KeyvStorageMethod;
};

export type KeyvSerializationCapability = {
	compatible: boolean;
	methods: KeyvSerializationMethods;
};

// --- Encryption adapter ---

export type KeyvEncryptionMethods = {
	encrypt: KeyvStorageMethod;
	decrypt: KeyvStorageMethod;
};

export type KeyvEncryptionCapability = {
	compatible: boolean;
	methods: KeyvEncryptionMethods;
};

// --- Helpers ---

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

function resolveMethod(obj: object, name: string): KeyvStorageMethod {
	return {
		exists: isMethod(obj, name),
		methodType: resolveMethodType(obj, name),
	};
}

const noneMethod: KeyvStorageMethod = { exists: false, methodType: "none" };

function buildMethods<T extends Record<string, KeyvStorageMethod>>(
	obj: object | null,
	names: readonly string[],
): T {
	const methods = {} as Record<string, KeyvStorageMethod>;
	for (const name of names) {
		methods[name] = obj ? resolveMethod(obj, name) : { ...noneMethod };
	}

	return methods as T;
}

// --- Detect functions ---

/**
 * Detect whether an object implements the full Keyv interface
 * @param obj - The object to check
 * @returns A {@link KeyvCapability} where `compatible` is `true` only when all required capabilities are present
 * @example
 * ```typescript
 * import Keyv, { detectKeyv } from 'keyv';
 *
 * const result = detectKeyv(new Keyv());
 * result.compatible;              // true — all capabilities present
 * result.methods.get.exists;      // true
 * result.methods.get.methodType;  // "async"
 *
 * const partial = detectKeyv(new Map());
 * partial.compatible;             // false — missing getMany, setMany, hooks, stats, etc.
 * partial.methods.get.exists;     // true
 * ```
 */
export function detectKeyv(obj: unknown): KeyvCapability {
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
		"getRaw",
		"getManyRaw",
		"setRaw",
		"setManyRaw",
		"iterator",
	] as const;

	const propertyNames = ["hooks", "stats"] as const;

	if (obj === null || obj === undefined || typeof obj !== "object") {
		const methods = buildMethods<KeyvMethods>(null, methodNames);
		const properties: KeyvProperties = { hooks: false, stats: false };
		return { compatible: false, methods, properties };
	}

	const methods = buildMethods<KeyvMethods>(obj, methodNames);
	const properties: KeyvProperties = {
		hooks: isProperty(obj, "hooks"),
		stats: isProperty(obj, "stats"),
	};

	const allRequired = [...methodNames, ...propertyNames] as const;
	const compatible = allRequired.every((k) => {
		if (k === "hooks" || k === "stats") {
			return properties[k];
		}

		return methods[k as keyof KeyvMethods].exists;
	});

	return { compatible, methods, properties };
}

/**
 * Detect whether an object implements the Keyv storage adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvStorageCapability} where:
 * - `compatible` is `true` when the object is a valid storage adapter (`"keyvStorage"`, `"mapLike"`, or `"asyncMap"`)
 * - `store` indicates the detected store type: `"keyvStorage"`, `"mapLike"`, `"asyncMap"`, or `"none"`
 * - `methods` maps each method name to `{ exists, methodType }`
 * @example
 * ```typescript
 * import { detectKeyvStorage } from 'keyv';
 *
 * const map = detectKeyvStorage(new Map());
 * map.compatible;               // true
 * map.store;                    // "mapLike"
 * map.methods.get.exists;       // true
 * map.methods.get.methodType;   // "sync"
 *
 * const adapter = detectKeyvStorage(asyncAdapter);
 * adapter.compatible;               // true
 * adapter.store;                    // "keyvStorage"
 * adapter.methods.get.methodType;   // "async"
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
	] as const;

	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			store: "none",
			methods: buildMethods<KeyvStorageMethods>(null, methodNames),
		};
	}

	const methods = buildMethods<KeyvStorageMethods>(obj, methodNames);

	// keyvStorage: all required methods present and async
	const requiredKeys: Array<keyof KeyvStorageMethods> = [
		"get",
		"has",
		"hasMany",
		"set",
		"setMany",
		"delete",
		"deleteMany",
		"clear",
	];
	const isKeyvStorage = requiredKeys.every(
		(k) => methods[k].exists && methods[k].methodType === "async",
	);

	if (isKeyvStorage) {
		return { compatible: true, store: "keyvStorage", methods };
	}

	// mapLike: get, set, delete, has all synchronous
	const mapLikeMethods: Array<keyof KeyvStorageMethods> = ["get", "set", "delete", "has"];
	const isMapLike = mapLikeMethods.every(
		(m) => methods[m].exists && methods[m].methodType === "sync",
	);

	if (isMapLike) {
		return { compatible: true, store: "mapLike", methods };
	}

	// asyncMap: get, set, delete, clear all present (not all sync — that would be mapLike)
	const asyncMapMethods: Array<keyof KeyvStorageMethods> = ["get", "set", "delete", "clear"];
	const isAsyncMap = asyncMapMethods.every((m) => methods[m].exists);

	if (isAsyncMap) {
		return { compatible: true, store: "asyncMap", methods };
	}

	return { compatible: false, store: "none", methods };
}

/**
 * Detect whether an object implements the Keyv compression adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvCompressionCapability} where `compatible` is `true` when both `compress` and `decompress` methods are present
 * @example
 * ```typescript
 * import { detectKeyvCompression } from 'keyv';
 *
 * detectKeyvCompression({ compress: (d) => d, decompress: (d) => d });
 * // { compatible: true, methods: { compress: { exists: true, methodType: "sync" }, decompress: { exists: true, methodType: "sync" } } }
 * ```
 */
export function detectKeyvCompression(obj: unknown): KeyvCompressionCapability {
	const methodNames = ["compress", "decompress"] as const;

	if (obj === null || obj === undefined || typeof obj !== "object") {
		return { compatible: false, methods: buildMethods<KeyvCompressionMethods>(null, methodNames) };
	}

	const methods = buildMethods<KeyvCompressionMethods>(obj, methodNames);
	const compatible = methodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}

/**
 * Detect whether an object implements the Keyv serialization adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvSerializationCapability} where `compatible` is `true` when both `stringify` and `parse` methods are present
 * @example
 * ```typescript
 * import { detectKeyvSerialization } from 'keyv';
 *
 * detectKeyvSerialization(JSON);
 * // { compatible: true, methods: { stringify: { exists: true, methodType: "sync" }, parse: { exists: true, methodType: "sync" } } }
 * ```
 */
export function detectKeyvSerialization(obj: unknown): KeyvSerializationCapability {
	const methodNames = ["stringify", "parse"] as const;

	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<KeyvSerializationMethods>(null, methodNames),
		};
	}

	const methods = buildMethods<KeyvSerializationMethods>(obj, methodNames);
	const compatible = methodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}

/**
 * Detect whether an object implements the Keyv encryption adapter interface
 * @param obj - The object to check
 * @returns A {@link KeyvEncryptionCapability} where `compatible` is `true` when both `encrypt` and `decrypt` methods are present
 * @example
 * ```typescript
 * import { detectKeyvEncryption } from 'keyv';
 *
 * detectKeyvEncryption({ encrypt: (d) => d, decrypt: (d) => d });
 * // { compatible: true, methods: { encrypt: { exists: true, methodType: "sync" }, decrypt: { exists: true, methodType: "sync" } } }
 * ```
 */
export function detectKeyvEncryption(obj: unknown): KeyvEncryptionCapability {
	const methodNames = ["encrypt", "decrypt"] as const;

	if (obj === null || obj === undefined || typeof obj !== "object") {
		return { compatible: false, methods: buildMethods<KeyvEncryptionMethods>(null, methodNames) };
	}

	const methods = buildMethods<KeyvEncryptionMethods>(obj, methodNames);
	const compatible = methodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}
