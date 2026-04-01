export type MethodType = "sync" | "async" | "none";

export type KeyvStorageMethod = {
	exists: boolean;
	methodType: MethodType;
};

// --- Keyv (full interface) ---

const keyvMethodNames = [
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

const keyvPropertyNames = ["hooks", "stats"] as const;

export type KeyvMethods = Record<(typeof keyvMethodNames)[number], KeyvStorageMethod>;

export type KeyvProperties = Record<(typeof keyvPropertyNames)[number], boolean>;

export type KeyvCapability = {
	compatible: boolean;
	methods: KeyvMethods;
	properties: KeyvProperties;
};

// --- Storage adapter ---

const keyvStorageMethodNames = [
	"get",
	"getMany",
	"has",
	"hasMany",
	"set",
	"setMany",
	"delete",
	"deleteMany",
	"clear",
	"disconnect",
	"iterator",
] as const;

export type KeyvStorageMethods = Record<(typeof keyvStorageMethodNames)[number], KeyvStorageMethod>;

export type KeyvStorageCapability = {
	compatible: boolean;
	store: "mapLike" | "keyvStorage" | "asyncMap" | "none";
	methods: KeyvStorageMethods;
};

// --- Compression adapter ---

const keyvCompressionMethodNames = ["compress", "decompress"] as const;

export type KeyvCompressionMethods = Record<
	(typeof keyvCompressionMethodNames)[number],
	KeyvStorageMethod
>;

export type KeyvCompressionCapability = {
	compatible: boolean;
	methods: KeyvCompressionMethods;
};

// --- Serialization adapter ---

const keyvSerializationMethodNames = ["stringify", "parse"] as const;

export type KeyvSerializationMethods = Record<
	(typeof keyvSerializationMethodNames)[number],
	KeyvStorageMethod
>;

export type KeyvSerializationCapability = {
	compatible: boolean;
	methods: KeyvSerializationMethods;
};

// --- Encryption adapter ---

const keyvEncryptionMethodNames = ["encrypt", "decrypt"] as const;

export type KeyvEncryptionMethods = Record<
	(typeof keyvEncryptionMethodNames)[number],
	KeyvStorageMethod
>;

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
	names: readonly (keyof T & string)[],
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
	if (obj === null || obj === undefined || typeof obj !== "object") {
		const methods = buildMethods<KeyvMethods>(null, keyvMethodNames);
		const properties: KeyvProperties = { hooks: false, stats: false };
		return { compatible: false, methods, properties };
	}

	const methods = buildMethods<KeyvMethods>(obj, keyvMethodNames);
	const properties: KeyvProperties = {
		hooks: isProperty(obj, "hooks"),
		stats: isProperty(obj, "stats"),
	};

	const allRequired = [...keyvMethodNames, ...keyvPropertyNames] as const;
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
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			store: "none",
			methods: buildMethods<KeyvStorageMethods>(null, keyvStorageMethodNames),
		};
	}

	const methods = buildMethods<KeyvStorageMethods>(obj, keyvStorageMethodNames);

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
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<KeyvCompressionMethods>(null, keyvCompressionMethodNames),
		};
	}

	const methods = buildMethods<KeyvCompressionMethods>(obj, keyvCompressionMethodNames);
	const compatible = keyvCompressionMethodNames.every((k) => methods[k].exists);
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
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<KeyvSerializationMethods>(null, keyvSerializationMethodNames),
		};
	}

	const methods = buildMethods<KeyvSerializationMethods>(obj, keyvSerializationMethodNames);
	const compatible = keyvSerializationMethodNames.every((k) => methods[k].exists);
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
	if (obj === null || obj === undefined || typeof obj !== "object") {
		return {
			compatible: false,
			methods: buildMethods<KeyvEncryptionMethods>(null, keyvEncryptionMethodNames),
		};
	}

	const methods = buildMethods<KeyvEncryptionMethods>(obj, keyvEncryptionMethodNames);
	const compatible = keyvEncryptionMethodNames.every((k) => methods[k].exists);
	return { compatible, methods };
}
