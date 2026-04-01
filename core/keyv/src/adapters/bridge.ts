// biome-ignore-all lint/suspicious/noExplicitAny: bridge adapter accepts any store
import { Hookified } from "hookified";
import { detectKeyvStorage, type KeyvStorageCapability } from "../capabilities.js";
import type { KeyvStorageAdapter, KeyvStorageGetResult } from "../types/adapters.js";
import { type KeyvEntry, KeyvEvents } from "../types/keyv.js";
import { isDataExpired } from "../utils.js";

/**
 * Configuration options for KeyvBridgeAdapter.
 */
export type KeyvBridgeAdapterOptions = {
	/**
	 * The namespace to use for keys.
	 * When set, all keys will be prefixed with the namespace followed by the key separator.
	 */
	namespace?: string;
	/**
	 * The separator used between namespace and key. Defaults to ":".
	 */
	keySeparator?: string;
};

/**
 * Interface for a promise-based store that can be used with KeyvBridgeAdapter.
 * The store must implement get, set, delete, and clear as async operations.
 * Optional methods (has, hasMany, getMany, setMany, deleteMany, iterator, disconnect)
 * will be delegated to the store if present, otherwise fallback implementations are used.
 */
export type KeyvBridgeStore = {
	/** Store configuration/options (e.g. dialect, url) */
	opts?: any;
	/** Retrieves a value by key */
	get(key: string): Promise<any>;
	/** Sets a value with a key and optional TTL */
	set(key: string, value: any, ttl?: number): Promise<any>;
	/** Deletes a key from the store */
	delete(key: string): Promise<boolean>;
	/** Clears all entries from the store */
	clear(): Promise<void>;
	/** Checks if a key exists in the store */
	has?(key: string): Promise<boolean>;
	/** Checks if multiple keys exist in the store */
	hasMany?(keys: string[]): Promise<boolean[]>;
	/** Retrieves multiple values by keys */
	getMany?(keys: string[]): Promise<any[]>;
	/** Sets multiple entries at once */
	setMany?(entries: any[]): Promise<any>;
	/** Deletes multiple keys at once */
	deleteMany?(keys: string[]): Promise<boolean | boolean[]>;
	/** Iterates over all entries, optionally filtered by namespace */
	iterator?(namespace?: string): AsyncGenerator<any>;
	/** Disconnects from the store */
	disconnect?(): Promise<void>;
	/** Subscribe to events (e.g. error events from v5 adapters) */
	on?(event: string, listener: (...args: any[]) => void): any;
};

/**
 * Data structure returned when parsing a prefixed key.
 */
export type KeyPrefixData = {
	/** The namespace extracted from the key, if present */
	namespace?: string;
	/** The key without the namespace prefix */
	key: string;
};

/**
 * A bridge storage adapter for Keyv that wraps any promise-based store.
 *
 * This class provides a unified interface for using various async stores
 * with Keyv, handling namespace prefixing, TTL-based expiration, and batch operations.
 * If the underlying store implements optional methods (has, hasMany, getMany, etc.),
 * the bridge will delegate to them. Otherwise, it falls back to using primitives.
 *
 * @example
 * ```typescript
 * // Using with a promise-based store
 * const bridge = new KeyvBridgeAdapter(myAsyncStore, { namespace: 'cache' });
 *
 * // Using with Keyv
 * const keyv = new Keyv({ store: new KeyvBridgeAdapter(myAsyncStore) });
 * ```
 */
export class KeyvBridgeAdapter extends Hookified implements KeyvStorageAdapter {
	private _store: KeyvBridgeStore;
	private _namespace?: string;
	private _keySeparator = ":";
	private readonly _capabilities: KeyvStorageCapability;

	/**
	 * Creates a new KeyvBridgeAdapter instance.
	 * @param store - The underlying promise-based store to bridge
	 * @param options - Configuration options for the adapter
	 */
	constructor(store: KeyvBridgeStore, options?: KeyvBridgeAdapterOptions) {
		super({ throwOnHookError: false });
		this._store = store;

		if (options?.keySeparator) {
			this._keySeparator = options.keySeparator;
		}

		if (options?.namespace) {
			this._namespace = options.namespace;
		}

		// Detect optional methods at construction time
		this._capabilities = detectKeyvStorage(store);

		// Forward error events from the underlying store
		if (typeof store.on === "function") {
			store.on(KeyvEvents.ERROR, (error: any) => this.emit(KeyvEvents.ERROR, error));
		}
	}

	/**
	 * Gets the underlying store instance.
	 */
	public get store() {
		return this._store;
	}

	/**
	 * Sets the underlying store instance.
	 */
	public set store(store: KeyvBridgeStore) {
		this._store = store;
	}

	/**
	 * Gets the detected capabilities of the underlying store.
	 */
	public get capabilities(): KeyvStorageCapability {
		return this._capabilities;
	}

	/**
	 * Gets the current key separator used between namespace and key.
	 */
	public get keySeparator() {
		return this._keySeparator;
	}

	/**
	 * Sets the key separator used between namespace and key.
	 */
	public set keySeparator(separator: string) {
		this._keySeparator = separator;
	}

	/**
	 * Gets the current namespace.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace.
	 */
	public set namespace(namespace: string | undefined) {
		this._namespace = namespace;
	}

	/**
	 * Creates a prefixed key by combining the namespace and key with the separator.
	 * @param key - The base key
	 * @param namespace - Optional namespace to prefix the key with
	 * @returns The prefixed key if namespace is provided, otherwise the original key
	 */
	public getKeyPrefix(key: string, namespace?: string) {
		if (namespace) {
			return `${namespace}${this._keySeparator}${key}`;
		}

		return key;
	}

	/**
	 * Parses a prefixed key to extract the namespace and original key.
	 * @param key - The prefixed key to parse
	 * @returns An object containing the namespace (if present) and the original key
	 */
	public getKeyPrefixData(key: string): KeyPrefixData {
		if (this._namespace && key.startsWith(`${this._namespace}${this._keySeparator}`)) {
			return {
				namespace: this._namespace,
				key: key.slice(this._namespace.length + this._keySeparator.length),
			};
		}

		return { key };
	}

	/**
	 * Retrieves a value from the store by key.
	 * Automatically handles namespace prefixing and TTL expiration.
	 * @param key - The key to retrieve
	 * @returns The stored data, or undefined if not found or expired
	 */
	public async get<T>(key: string): Promise<KeyvStorageGetResult<T>> {
		const keyPrefix = this.getKeyPrefix(key, this._namespace);
		const data = await this._store.get(keyPrefix);
		if (data === undefined || data === null) {
			return undefined;
		}

		// Check if it is expired
		if (isDataExpired(data)) {
			await this._store.delete(keyPrefix);
			return undefined;
		}

		return data as KeyvStorageGetResult<T>;
	}

	/**
	 * Retrieves multiple values from the store by their keys.
	 * Delegates to the store's native getMany if available.
	 * @param keys - Array of keys to retrieve
	 * @returns Array of stored data in the same order as the input keys
	 */
	public async getMany<T>(keys: string[]): Promise<Array<KeyvStorageGetResult<T | undefined>>> {
		if (this._capabilities.methods.getMany.exists) {
			const prefixedKeys = keys.map((key) => this.getKeyPrefix(key, this._namespace));
			/* v8 ignore next -- @preserve */
			const results = (await this._store.getMany?.(prefixedKeys)) ?? [];
			const values: Array<KeyvStorageGetResult<T | undefined>> = [];
			for (const [index, data] of results.entries()) {
				if (data === undefined || data === null) {
					values.push(undefined as KeyvStorageGetResult<T | undefined>);
					continue;
				}

				if (isDataExpired(data)) {
					await this._store.delete(prefixedKeys[index]);
					values.push(undefined as KeyvStorageGetResult<T | undefined>);
					continue;
				}

				values.push(data as KeyvStorageGetResult<T | undefined>);
			}

			return values;
		}

		const values: Array<KeyvStorageGetResult<T | undefined>> = [];
		for (const key of keys) {
			const data = await this.get<T>(key);
			values.push(data as KeyvStorageGetResult<T | undefined>);
		}

		return values;
	}

	/**
	 * Stores a value in the store with an optional TTL.
	 * @param key - The key to store the value under
	 * @param value - The value to store
	 * @param ttl - Optional time-to-live in milliseconds
	 * @returns Always returns true indicating success
	 */
	public async set(key: string, value: any, ttl?: number): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this._namespace);
		const result = await this._store.set(keyPrefix, value, ttl);
		if (typeof result === "boolean") {
			return result;
		}

		return true;
	}

	/**
	 * Stores multiple entries in the store at once.
	 * Delegates to the store's native setMany if available, otherwise loops over set.
	 * @param entries - Array of entries containing key, value, and optional TTL
	 */
	public async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		if (this._capabilities.methods.setMany.exists) {
			const prefixedEntries = entries.map((entry) => ({
				...entry,
				key: this.getKeyPrefix(entry.key, this._namespace),
			}));
			await this._store.setMany?.(prefixedEntries);
			return entries.map(() => true);
		}

		const results: boolean[] = [];
		for (const entry of entries) {
			await this.set(entry.key, entry.value, entry.ttl);
			results.push(true);
		}

		return results;
	}

	/**
	 * Checks if a key exists in the store and is not expired.
	 * Delegates to the store's native has if available.
	 * @param key - The key to check
	 * @returns True if the key exists and is not expired, false otherwise
	 */
	public async has(key: string): Promise<boolean> {
		if (this._capabilities.methods.has.exists) {
			const keyPrefix = this.getKeyPrefix(key, this._namespace);
			/* v8 ignore next -- @preserve */
			return this._store.has?.(keyPrefix) ?? false;
		}

		const data = await this.get(key);
		return data !== undefined;
	}

	/**
	 * Checks if multiple keys exist in the store and are not expired.
	 * Delegates to the store's native hasMany if available.
	 * @param keys - Array of keys to check
	 * @returns Array of booleans indicating existence for each key
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (this._capabilities.methods.hasMany.exists) {
			const prefixedKeys = keys.map((key) => this.getKeyPrefix(key, this._namespace));
			/* v8 ignore next -- @preserve */
			return this._store.hasMany?.(prefixedKeys) ?? [];
		}

		const results: boolean[] = [];
		for (const key of keys) {
			results.push(await this.has(key));
		}

		return results;
	}

	/**
	 * Deletes a value from the store by key.
	 * @param key - The key to delete
	 * @returns True if the key was deleted, false otherwise
	 */
	public async delete(key: string): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this._namespace);
		return this._store.delete(keyPrefix);
	}

	/**
	 * Deletes multiple keys from the store at once.
	 * Delegates to the store's native deleteMany if available.
	 * @param keys - Array of keys to delete
	 * @returns Array of booleans indicating success for each key
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		if (this._capabilities.methods.deleteMany.exists) {
			const prefixedKeys = keys.map((key) => this.getKeyPrefix(key, this._namespace));
			/* v8 ignore next -- @preserve */
			const result = (await this._store.deleteMany?.(prefixedKeys)) ?? [];
			// Normalize: some stores return a single boolean instead of an array
			return Array.isArray(result) ? result : keys.map(() => result);
		}

		const results: boolean[] = [];
		for (const key of keys) {
			try {
				const keyPrefix = this.getKeyPrefix(key, this._namespace);
				const result = await this._store.delete(keyPrefix);
				results.push(result);
			} catch (error) {
				this.emit(KeyvEvents.ERROR, error);
				results.push(false);
			}
		}

		return results;
	}

	/**
	 * Clears entries from the store. If a namespace is set and the store supports
	 * iteration, only entries within that namespace are removed. Otherwise, the
	 * entire store is cleared.
	 */
	public async clear(): Promise<void> {
		if (!this._namespace || !this._capabilities.methods.iterator.exists) {
			await this._store.clear();
			return;
		}

		const prefix = `${this._namespace}${this._keySeparator}`;
		const keysToDelete: string[] = [];
		/* v8 ignore next -- @preserve */
		for await (const entry of this._store.iterator?.(this._namespace) ?? []) {
			const key = Array.isArray(entry) ? entry[0] : entry;
			if (typeof key === "string" && key.startsWith(prefix)) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			await this._store.delete(key);
		}
	}

	/**
	 * Creates an async iterator for iterating over store entries.
	 * If the underlying store does not support iteration, returns an empty generator.
	 * @returns An async generator yielding [key, value] pairs
	 */
	public async *iterator<Value>(): AsyncGenerator<
		Array<string | Awaited<Value> | undefined>,
		void
	> {
		if (!this._capabilities.methods.iterator.exists) {
			return;
		}

		const namespace = this._namespace;
		const prefix = namespace ? `${namespace}${this._keySeparator}` : undefined;

		/* v8 ignore next -- @preserve */
		for await (const entry of this._store.iterator?.(this._namespace) ?? []) {
			const [key, data] = Array.isArray(entry) ? entry : [entry];

			// Filter by namespace if set
			if (prefix && typeof key === "string" && !key.startsWith(prefix)) {
				continue;
			}

			// Check expiration
			if (data && isDataExpired(data)) {
				await this._store.delete(key);
				continue;
			}

			// Extract the key without namespace prefix
			const keyWithoutPrefix = prefix && typeof key === "string" ? key.slice(prefix.length) : key;

			yield [keyWithoutPrefix, data];
		}
	}

	/**
	 * Disconnects from the underlying store.
	 * No-op if the store does not support disconnect.
	 */
	public async disconnect(): Promise<void> {
		if (this._capabilities.methods.disconnect.exists) {
			await this._store.disconnect?.();
		}
	}
}
