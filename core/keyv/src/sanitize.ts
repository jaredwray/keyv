import type {
	KeyvSanitizeAdapter,
	KeyvSanitizeOptions,
	KeyvSanitizePatterns,
	KeyvSanitizePatternsOptions,
} from "./types.js";

const categoryPatterns: Record<keyof KeyvSanitizePatterns, RegExp[]> = {
	sql: [/;/g, /--/g, /\/\*/g],
	mongo: [/^\$/g, /\{\s*\$/g],
	escape: [/\0/g, /\r/g, /\n/g],
	path: [/\.\.\//g, /\.\.\\/g],
};

/**
 * Compile an array of RegExp patterns from the enabled categories.
 * Returns `undefined` when nothing is enabled.
 */
function buildPatterns(options: KeyvSanitizePatterns): RegExp[] | undefined {
	const patterns: RegExp[] = [];

	for (const [category, regexes] of Object.entries(categoryPatterns)) {
		if (options[category as keyof KeyvSanitizePatterns] !== false) {
			patterns.push(...regexes);
		}
	}

	return patterns.length > 0 ? patterns : undefined;
}

/**
 * Run all patterns against a string, stripping matched sequences.
 */
function applyPatterns(value: string, patterns: RegExp[]): string {
	for (const pattern of patterns) {
		pattern.lastIndex = 0;
		value = value.replace(pattern, "");
	}

	return value;
}

const allOn: KeyvSanitizePatterns = { escape: true, mongo: true, path: true, sql: true };
const allOff: KeyvSanitizePatterns = { escape: false, mongo: false, path: false, sql: false };

/**
 * Encapsulates key and namespace sanitization with an LRU result cache.
 */
export class KeyvSanitize implements KeyvSanitizeAdapter {
	private _keys: KeyvSanitizePatterns = { ...allOff };
	private _namespace: KeyvSanitizePatterns = { ...allOff };
	private _keyPatterns: RegExp[] | undefined;
	private _namespacePatterns: RegExp[] | undefined;
	private _enabled = false;
	private _cacheKeys = new Map<string, string>();
	private _cacheNamespaces = new Map<string, string>();
	private _cacheMax = 10_000;

	constructor(options?: KeyvSanitizeOptions) {
		if (options !== undefined) {
			this.updateOptions(options);
		}
	}

	/**
	 * The key sanitization pattern configuration.
	 */
	public get keys(): KeyvSanitizePatterns {
		return this._keys;
	}

	/**
	 * Whether any sanitization pattern (keys or namespace) is enabled.
	 */
	public get enabled(): boolean {
		return this._enabled;
	}

	/**
	 * The namespace sanitization pattern configuration.
	 */
	public get namespace(): KeyvSanitizePatterns {
		return this._namespace;
	}

	/**
	 * Update the sanitization configuration. Recompiles patterns and clears the cache.
	 */
	public updateOptions(options: KeyvSanitizeOptions): void {
		this._keys = this.resolvePatterns(options.keys);
		this._namespace = this.resolvePatterns(options.namespace);
		this._enabled =
			Object.values(this._keys).some(Boolean) || Object.values(this._namespace).some(Boolean);
		this._keyPatterns = buildPatterns(this._keys);
		this._namespacePatterns = buildPatterns(this._namespace);
		this._cacheKeys.clear();
		this._cacheNamespaces.clear();
	}

	/**
	 * Sanitize a single key. Uses an LRU cache for repeated lookups.
	 */
	public cleanKey(key: string): string {
		if (!this._keyPatterns) {
			return key;
		}

		const cached = this._cacheKeys.get(key);
		if (cached !== undefined) {
			this._cacheKeys.delete(key);
			this._cacheKeys.set(key, cached);
			return cached;
		}

		const result = applyPatterns(key, this._keyPatterns);

		this._cacheKeys.set(key, result);
		if (this._cacheKeys.size > this._cacheMax) {
			const first = this._cacheKeys.keys().next().value;
			if (first !== undefined) {
				this._cacheKeys.delete(first);
			}
		}

		return result;
	}

	/**
	 * Sanitize an array of keys.
	 */
	public cleanKeys(keys: string[]): string[] {
		if (!this._keyPatterns) {
			return keys;
		}

		return keys.map((k) => this.cleanKey(k));
	}

	/**
	 * Sanitize a namespace string. Uses an LRU cache for repeated lookups.
	 */
	public cleanNamespace(ns: string): string {
		if (!this._namespacePatterns) {
			return ns;
		}

		const cached = this._cacheNamespaces.get(ns);
		if (cached !== undefined) {
			this._cacheNamespaces.delete(ns);
			this._cacheNamespaces.set(ns, cached);
			return cached;
		}

		const result = applyPatterns(ns, this._namespacePatterns);

		this._cacheNamespaces.set(ns, result);
		if (this._cacheNamespaces.size > this._cacheMax) {
			const first = this._cacheNamespaces.keys().next().value;
			if (first !== undefined) {
				this._cacheNamespaces.delete(first);
			}
		}

		return result;
	}

	/**
	 * Clear the LRU caches.
	 */
	public clearCache(): void {
		this._cacheKeys.clear();
		this._cacheNamespaces.clear();
	}

	private resolvePatterns(
		options?: boolean | KeyvSanitizePatterns | KeyvSanitizePatternsOptions,
	): KeyvSanitizePatterns {
		if (options === false || options === undefined) {
			return { ...allOff };
		}

		if (options === true) {
			return { ...allOn };
		}

		return {
			sql: options.sql !== false,
			mongo: options.mongo !== false,
			escape: options.escape !== false,
			path: options.path !== false,
		};
	}
}
