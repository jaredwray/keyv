// biome-ignore-all lint/suspicious/noExplicitAny: map type
import { Hookified } from "hookified";
import { detectKeyvStorage, type KeyvStorageCapability } from "../capabilities.js";
import { Keyv } from "../keyv.js";
import type { KeyvStorageAdapter, KeyvStorageGetResult } from "../types/adapters.js";
import { type KeyvEntry, KeyvEvents } from "../types/keyv.js";

/**
 * Internal wrapper for values stored in the memory adapter.
 * Keeps expiry metadata co-located with the value but outside
 * the serialized/compressed/encrypted payload.
 */
type MemoryEntry = {
	value: unknown;
	expires?: number;
};

/**
 * Configuration options for KeyvMemoryAdapter.
 */
export type KeyvMemoryAdapterOptions = {
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
 * Interface for a Map-like store that can be used with KeyvMemoryAdapter.
 * This allows any object implementing these methods to be used as the underlying storage.
 * Compatible with Map, QuickLRU, lru.min, and other LRU cache implementations.
 */
export type KeyvMapType = {
	/** Retrieves a value by key */
	get: (key: string) => any;
	/** Sets a value with a key. Additional parameters (like TTL) vary by implementation. */
	set: (key: string, value: any, ...args: any[]) => any;
	/** Deletes a key from the store */
	delete: (key: string) => boolean;
	/** Clears all entries from the store */
	clear: () => void;
	/** Checks if a key exists in the store */
	has: (key: string) => boolean;
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
 * An in-memory storage adapter for Keyv that wraps any Map-like object.
 *
 * This class provides a unified interface for using various Map-like stores
 * with Keyv, handling namespace prefixing, TTL-based expiration, and batch operations.
 *
 * @example
 * ```typescript
 * // Using with a standard Map
 * const store = new KeyvMemoryAdapter(new Map(), { namespace: 'cache' });
 *
 * // Using with a custom store
 * const customStore = new KeyvMemoryAdapter(myCustomMapLikeStore, {
 *   namespace: 'tenant-123',
 *   keySeparator: ':'
 * });
 * ```
 */
export class KeyvMemoryAdapter extends Hookified implements KeyvStorageAdapter {
	private _store: KeyvMapType;
	private _namespace?: string;
	private _keySeparator = ":";
	private readonly _capabilities: KeyvStorageCapability;

	/**
	 * Creates a new KeyvMemoryAdapter instance.
	 * @param store - The underlying Map or Map-like object to use for storage
	 * @param options - Configuration options for the store
	 */
	constructor(store: KeyvMapType, options?: KeyvMemoryAdapterOptions) {
		super({ throwOnHookError: false });
		this._store = store;
		this._capabilities = detectKeyvStorage(store);

		if (options?.keySeparator) {
			this._keySeparator = options.keySeparator;
		}

		if (options?.namespace) {
			this._namespace = options?.namespace;
		}
	}

	/**
	 * Gets the detected capabilities of the underlying store.
	 */
	public get capabilities(): KeyvStorageCapability {
		return this._capabilities;
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
	public set store(store: KeyvMapType) {
		this._store = store;
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
	public getKeyPrefixData(key: string) {
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
		const entry = this._store.get(keyPrefix) as MemoryEntry | undefined;
		if (entry === undefined || entry === null) {
			return undefined;
		}

		if (entry.expires !== undefined && Date.now() > entry.expires) {
			this._store.delete(keyPrefix);
			return undefined;
		}

		return entry.value as KeyvStorageGetResult<T>;
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
		const entry: MemoryEntry = {
			value,
			expires: ttl ? Date.now() + ttl : undefined,
		};
		this._store.set(keyPrefix, entry, ttl);
		return true;
	}

	/**
	 * Stores multiple entries in the store at once.
	 * @param entries - Array of entries containing key, value, and optional TTL
	 */
	public async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		const results: boolean[] = [];
		for (const entry of entries) {
			const keyPrefix = this.getKeyPrefix(entry.key, this._namespace);
			const memEntry: MemoryEntry = {
				value: entry.value,
				expires: entry.ttl ? Date.now() + entry.ttl : undefined,
			};
			this._store.set(keyPrefix, memEntry, entry.ttl);
			results.push(true);
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
	 * Clears entries from the store. If a namespace is set, only entries
	 * within that namespace are removed. Otherwise, the entire store is cleared.
	 * NOTE: if there is no `keys()` then we just do a full clear.
	 */
	public async clear(): Promise<void> {
		if (!this._namespace || typeof (this._store as Map<any, any>).keys !== "function") {
			this._store.clear();
			return;
		}

		const prefix = `${this._namespace}${this._keySeparator}`;
		const keysToDelete: string[] = [];
		for (const key of (this._store as Map<any, any>).keys()) {
			if (key.startsWith(prefix)) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this._store.delete(key);
		}
	}

	/**
	 * Checks if a key exists in the store and is not expired.
	 * @param key - The key to check
	 * @returns True if the key exists and is not expired, false otherwise
	 */
	public async has(key: string): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this._namespace);
		const entry = this._store.get(keyPrefix) as MemoryEntry | undefined;
		if (entry === undefined || entry === null) {
			return false;
		}

		if (entry.expires !== undefined && Date.now() > entry.expires) {
			this._store.delete(keyPrefix);
			return false;
		}

		return true;
	}

	/**
	 * Checks if multiple keys exist in the store and are not expired.
	 * @param keys - Array of keys to check
	 * @returns Array of booleans indicating existence for each key
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const results: boolean[] = [];
		for (const key of keys) {
			results.push(await this.has(key));
		}

		return results;
	}

	/**
	 * Retrieves multiple values from the store by their keys.
	 * @param keys - Array of keys to retrieve
	 * @returns Array of stored data in the same order as the input keys
	 */
	public async getMany<T>(keys: string[]): Promise<Array<KeyvStorageGetResult<T | undefined>>> {
		const values: Array<KeyvStorageGetResult<T | undefined>> = [];
		for (const key of keys) {
			const keyPrefix = this.getKeyPrefix(key, this._namespace);
			const entry = this._store.get(keyPrefix) as MemoryEntry | undefined;
			if (entry === undefined || entry === null) {
				values.push(undefined as KeyvStorageGetResult<T | undefined>);
				continue;
			}

			if (entry.expires !== undefined && Date.now() > entry.expires) {
				this._store.delete(keyPrefix);
				values.push(undefined as KeyvStorageGetResult<T | undefined>);
				continue;
			}

			values.push(entry.value as KeyvStorageGetResult<T | undefined>);
		}

		return values;
	}

	/**
	 * Deletes multiple keys from the store at once.
	 * @param keys - Array of keys to delete
	 * @returns Array of booleans indicating success for each key
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const results: boolean[] = [];
		for (const key of keys) {
			try {
				const keyPrefix = this.getKeyPrefix(key, this._namespace);
				const existed = this._store.has(keyPrefix);
				this._store.delete(keyPrefix);
				results.push(existed);
			} catch (error) {
				this.emit(KeyvEvents.ERROR, error);
				results.push(false);
			}
		}

		return results;
	}

	/**
	 * Creates an async iterator for iterating over store entries.
	 * If the underlying store does not support iteration, returns an empty generator.
	 * @returns {AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>} An async generator yielding [key, value] pairs
	 */
	public async *iterator<Value>(): AsyncGenerator<
		Array<string | Awaited<Value> | undefined>,
		void
	> {
		// Check if store supports iteration
		if (typeof (this._store as Map<any, any>).entries !== "function") {
			return;
		}

		const namespace = this._namespace;

		for (const [key, raw] of (this._store as Map<any, any>).entries()) {
			// Filter by namespace if set
			if (namespace) {
				if (!key.startsWith(`${namespace}${this._keySeparator}`)) {
					continue;
				}
			}

			const entry = raw as MemoryEntry;

			// Check expiration
			if (entry?.expires !== undefined && Date.now() > entry.expires) {
				this._store.delete(key);
				continue;
			}

			// Extract the key without namespace prefix
			const keyWithoutPrefix = namespace
				? key.slice(namespace.length + this._keySeparator.length)
				: key;

			yield [keyWithoutPrefix, entry?.value];
		}
	}

	/**
	 * No-op disconnect for in-memory stores.
	 */
	public async disconnect(): Promise<void> {}
}

/**
 * Creates a Keyv instance with a memory adapter optimized for in-memory storage.
 *
 * This factory function configures Keyv to bypass serialization/deserialization
 * and key prefixing, resulting in faster performance for in-memory use cases
 * where data doesn't need to be persisted or transmitted.
 *
 * @param store - The underlying Map or Map-like object to use for storage
 * @param options - Configuration options for the memory adapter
 * @returns A configured Keyv instance with optimized settings for in-memory storage
 *
 * @example
 * ```typescript
 * // Create a simple in-memory cache
 * const cache = createKeyv(new Map());
 * await cache.set('user:1', { name: 'John' });
 *
 * // Create with namespace for multi-tenant scenarios
 * const tenantCache = createKeyv(new Map(), {
 *   namespace: 'tenant-123',
 *   keySeparator: ':'
 * });
 * ```
 */
export function createKeyv(store: KeyvMapType, options?: KeyvMemoryAdapterOptions) {
	const { namespace, ...adapterOptions } = options ?? {};
	const memoryAdapter = new KeyvMemoryAdapter(store, adapterOptions);
	const keyv = new Keyv({
		store: memoryAdapter,
		serialization: false,
		namespace,
	});
	return keyv;
}
