import {
	type DeserializedData,
	KeyvHooks,
	type KeyvSanitizeOptions,
} from "./types.js";

/**
 * Check whether a deserialized entry has expired based on its `expires` timestamp.
 */
export function isDataExpired<Value>(data: DeserializedData<Value>): boolean {
	return typeof data.expires === "number" && Date.now() > data.expires;
}

/**
 * Scan parallel `keys` and `data` arrays, nullify any expired entries in
 * `data`, and batch-delete the corresponding keys via `keyv.deleteMany()`.
 */
export async function deleteExpiredKeys<Value>(
	keys: string[],
	data: Array<DeserializedData<Value> | undefined | null>,
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
		[
			"preGetManyRaw",
			"Use KeyvHooks.BEFORE_GET_MANY_RAW ('before:getManyRaw') instead",
		],
		[
			"postGetManyRaw",
			"Use KeyvHooks.AFTER_GET_MANY_RAW ('after:getManyRaw') instead",
		],
		["preSetRaw", "Use KeyvHooks.BEFORE_SET_RAW ('before:setRaw') instead"],
		["postSetRaw", "Use KeyvHooks.AFTER_SET_RAW ('after:setRaw') instead"],
		[
			"preSetManyRaw",
			"Use KeyvHooks.BEFORE_SET_MANY_RAW ('before:setManyRaw') instead",
		],
		[
			"postSetManyRaw",
			"Use KeyvHooks.AFTER_SET_MANY_RAW ('after:setManyRaw') instead",
		],
		["preDelete", "Use KeyvHooks.BEFORE_DELETE ('before:delete') instead"],
		["postDelete", "Use KeyvHooks.AFTER_DELETE ('after:delete') instead"],
	]);
}

const categoryChars: Record<keyof KeyvSanitizeOptions, string> = {
	sql: "'\"`;",
	// biome-ignore lint/suspicious/noTemplateCurlyInString: literal chars not a template
	mongo: "${}",
	escape: "\\\\\0\n\r",
	path: "/",
};

/**
 * Build a single RegExp from the enabled sanitization categories.
 * Called once at construction time (or when the option changes) so that
 * per-key sanitization is a single `String.prototype.replace()` call.
 * @param options - Categories to enable (all default to `true`)
 * @returns A global RegExp, or `undefined` if every category is disabled
 */
export function buildSanitizePattern(
	options: KeyvSanitizeOptions = {},
): RegExp | undefined {
	let chars = "";
	for (const [category, categoryCharSet] of Object.entries(categoryChars)) {
		if (options[category as keyof KeyvSanitizeOptions] !== false) {
			chars += categoryCharSet;
		}
	}

	return chars.length > 0 ? new RegExp(`[${chars}]`, "g") : undefined;
}

/**
 * Strip unsafe characters from a key using a precompiled pattern
 * @param key - The key to sanitize
 * @param pattern - A precompiled RegExp from `buildSanitizePattern`, or `undefined` to skip
 * @returns The sanitized key string
 */
export function sanitizeKey(key: string, pattern: RegExp | undefined): string {
	if (!pattern) {
		return key;
	}

	pattern.lastIndex = 0;
	return key.replace(pattern, "");
}

/**
 * Strip unsafe characters from an array of keys using a precompiled pattern
 * @param keys - The keys to sanitize
 * @param pattern - A precompiled RegExp from `buildSanitizePattern`, or `undefined` to skip
 * @returns The sanitized key strings
 */
export function sanitizeKeys(
	keys: string[],
	pattern: RegExp | undefined,
): string[] {
	/* v8 ignore next -- @preserve */
	if (!pattern) {
		return keys;
	}

	return keys.map((k) => sanitizeKey(k, pattern));
}
