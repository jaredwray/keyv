import type { KeyvSanitizeOptions } from "./types.js";

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
