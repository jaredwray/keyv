import { KeyvHooks, type KeyvValue } from "./types.js";

/**
 * Check whether a deserialized entry has expired based on its `expires` timestamp.
 */
export function isDataExpired<Value>(data: KeyvValue<Value>): boolean {
	return typeof data.expires === "number" && Date.now() > data.expires;
}

/**
 * Calculate an absolute expiry timestamp from a TTL value.
 * Returns `undefined` when `ttl` is absent, zero, negative, or non-finite
 * (meaning "no expiry").
 *
 * @param ttl - Time-to-live in milliseconds, or `undefined`
 * @returns Absolute expiry timestamp (ms since epoch), or `undefined`
 */
export function calculateExpires(ttl: number | undefined): number | undefined {
	if (typeof ttl !== "number" || ttl <= 0 || !Number.isFinite(ttl)) {
		return undefined;
	}

	return Date.now() + ttl;
}

/**
 * Resolve a TTL value by falling back to a default when none is given,
 * then normalising zero, negative, or non-finite values to `undefined` (meaning "no expiry").
 *
 * @param ttl - Explicit TTL in milliseconds, or `undefined`
 * @param defaultTtl - Fallback TTL (typically `Keyv._ttl`), or `undefined`
 * @returns The resolved TTL in milliseconds, or `undefined` for no expiry
 */
export function resolveTtl(
	ttl: number | undefined,
	defaultTtl: number | undefined,
): number | undefined {
	const resolved = ttl ?? defaultTtl;
	if (resolved === undefined || resolved <= 0 || !Number.isFinite(resolved)) {
		return undefined;
	}

	return resolved;
}

/**
 * Derive a store-level TTL from an absolute `expires` timestamp.
 * Returns `undefined` when `expires` is absent, non-finite, or when the derived
 * TTL is zero or negative (i.e. the entry has already expired).
 *
 * @param expires - Absolute expiry timestamp in milliseconds since epoch, or `undefined`
 * @returns The remaining TTL in milliseconds, or `undefined`
 */
export function ttlFromExpires(expires: number | undefined): number | undefined {
	if (typeof expires !== "number" || !Number.isFinite(expires)) {
		return undefined;
	}

	const remaining = expires - Date.now();
	return remaining > 0 ? remaining : undefined;
}

/**
 * Scan parallel `keys` and `data` arrays, nullify any expired entries in
 * `data`, and batch-delete the corresponding keys via `keyv.deleteMany()`.
 */
export async function deleteExpiredKeys<Value>(
	keys: string[],
	data: Array<KeyvValue<Value> | undefined | null>,
	keyv: { deleteMany(keys: string[]): Promise<boolean[]> },
): Promise<void> {
	const expiredKeys: string[] = [];
	for (const [index, row] of data.entries()) {
		if (row !== undefined && row !== null && isDataExpired(row)) {
			expiredKeys.push(keys[index]);
			data[index] = undefined;
		}
	}

	if (expiredKeys.length > 0) {
		await keyv.deleteMany(expiredKeys);
	}
}

/**
 * Maps new hook names to their deprecated equivalents so both fire during migration.
 */
export const deprecatedHookAliases = new Map<string, string>([
	[KeyvHooks.BEFORE_SET, KeyvHooks.PRE_SET],
	[KeyvHooks.AFTER_SET, KeyvHooks.POST_SET],
	[KeyvHooks.BEFORE_GET, KeyvHooks.PRE_GET],
	[KeyvHooks.AFTER_GET, KeyvHooks.POST_GET],
	[KeyvHooks.BEFORE_GET_MANY, KeyvHooks.PRE_GET_MANY],
	[KeyvHooks.AFTER_GET_MANY, KeyvHooks.POST_GET_MANY],
	[KeyvHooks.BEFORE_GET_RAW, KeyvHooks.PRE_GET_RAW],
	[KeyvHooks.AFTER_GET_RAW, KeyvHooks.POST_GET_RAW],
	[KeyvHooks.BEFORE_GET_MANY_RAW, KeyvHooks.PRE_GET_MANY_RAW],
	[KeyvHooks.AFTER_GET_MANY_RAW, KeyvHooks.POST_GET_MANY_RAW],
	[KeyvHooks.BEFORE_SET_RAW, KeyvHooks.PRE_SET_RAW],
	[KeyvHooks.AFTER_SET_RAW, KeyvHooks.POST_SET_RAW],
	[KeyvHooks.BEFORE_SET_MANY_RAW, KeyvHooks.PRE_SET_MANY_RAW],
	[KeyvHooks.AFTER_SET_MANY_RAW, KeyvHooks.POST_SET_MANY_RAW],
	[KeyvHooks.BEFORE_DELETE, KeyvHooks.PRE_DELETE],
	[KeyvHooks.AFTER_DELETE, KeyvHooks.POST_DELETE],
]);

/**
 * Build the deprecated-hooks map used by Hookified to warn when old PRE_/POST_ hook names are registered.
 */
export function buildDeprecatedHooks(): Map<string, string> {
	return new Map([
		["preSet", "Use KeyvHooks.BEFORE_SET ('before:set') instead"],
		["postSet", "Use KeyvHooks.AFTER_SET ('after:set') instead"],
		["preGet", "Use KeyvHooks.BEFORE_GET ('before:get') instead"],
		["postGet", "Use KeyvHooks.AFTER_GET ('after:get') instead"],
		["preGetMany", "Use KeyvHooks.BEFORE_GET_MANY ('before:getMany') instead"],
		["postGetMany", "Use KeyvHooks.AFTER_GET_MANY ('after:getMany') instead"],
		["preGetRaw", "Use KeyvHooks.BEFORE_GET_RAW ('before:getRaw') instead"],
		["postGetRaw", "Use KeyvHooks.AFTER_GET_RAW ('after:getRaw') instead"],
		["preGetManyRaw", "Use KeyvHooks.BEFORE_GET_MANY_RAW ('before:getManyRaw') instead"],
		["postGetManyRaw", "Use KeyvHooks.AFTER_GET_MANY_RAW ('after:getManyRaw') instead"],
		["preSetRaw", "Use KeyvHooks.BEFORE_SET_RAW ('before:setRaw') instead"],
		["postSetRaw", "Use KeyvHooks.AFTER_SET_RAW ('after:setRaw') instead"],
		["preSetManyRaw", "Use KeyvHooks.BEFORE_SET_MANY_RAW ('before:setManyRaw') instead"],
		["postSetManyRaw", "Use KeyvHooks.AFTER_SET_MANY_RAW ('after:setManyRaw') instead"],
		["preDelete", "Use KeyvHooks.BEFORE_DELETE ('before:delete') instead"],
		["postDelete", "Use KeyvHooks.AFTER_DELETE ('after:delete') instead"],
	]);
}
