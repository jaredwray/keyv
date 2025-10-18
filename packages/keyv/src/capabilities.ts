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
