// biome-ignore-all lint/suspicious/noExplicitAny: map type
import { Hookified } from "hookified";
import { Keyv } from "../keyv.js";
import {
	type KeyvEntry,
	KeyvEvents,
	type KeyvStorageAdapter,
	type KeyvValue,
	type StoredData,
} from "../types.js";
import { isDataExpired } from "../utils.js";

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

	/**
	 * Creates a new KeyvMemoryAdapter instance.
	 * @param store - The underlying Map or Map-like object to use for storage
	 * @param options - Configuration options for the store
	 */
	constructor(store: KeyvMapType, options?: KeyvMemoryAdapterOptions) {
		super({ throwOnHookError: false });
		this._store = store;

		if (options?.keySeparator) {
			this._keySeparator = options.keySeparator;
		}

		if (options?.namespace) {
			this._namespace = options?.namespace;
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
	 * Gets the current namespace.
	 * @returns The namespace string, or undefined if not set
	 */
	public getNamespace() {
		return this._namespace;
	}

	/**
	 * Sets the namespace.
	 * @param namespace - The namespace string, or undefined to clear
	 */
	public setNamespace(namespace: string | undefined) {
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
		if (key.includes(this._keySeparator)) {
			const [namespace, ...rest] = key.split(this._keySeparator);
			return { namespace, key: rest.join(this._keySeparator) };
		}

		return { key };
	}

	/**
	 * Retrieves a value from the store by key.
	 * Automatically handles namespace prefixing and TTL expiration.
	 * @param key - The key to retrieve
	 * @returns The stored data, or undefined if not found or expired
	 */
	public async get<T>(key: string): Promise<StoredData<T> | undefined> {
		const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
		const data = this._store.get(keyPrefix) as KeyvValue<T>;
		if (!data) {
			return undefined;
		}

		// Check if it is expired
		if (isDataExpired(data)) {
			this._store.delete(keyPrefix);
			return undefined;
		}

		return data as T;
	}

	/**
	 * Stores a value in the store with an optional TTL.
	 * @param key - The key to store the value under
	 * @param value - The value to store
	 * @param ttl - Optional time-to-live in milliseconds
	 * @returns Always returns true indicating success
	 */
	public async set(key: string, value: any, ttl?: number): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
		const data = { value, expires: ttl ? Date.now() + ttl : undefined };
		this._store.set(keyPrefix, data, ttl);
		return true;
	}

	/**
	 * Stores multiple entries in the store at once.
	 * @param entries - Array of entries containing key, value, and optional TTL
	 */
	public async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		const results: boolean[] = [];
		for (const entry of entries) {
			const result = await this.set(entry.key, entry.value, entry.ttl);
			results.push(result);
		}

		return results;
	}

	/**
	 * Deletes a value from the store by key.
	 * @param key - The key to delete
	 * @returns True if the key was deleted, false otherwise
	 */
	public async delete(key: string): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
		return this._store.delete(keyPrefix);
	}

	/**
	 * Clears all entries from the store.
	 * Note: This clears the entire underlying store, not just the current namespace.
	 */
	public async clear(): Promise<void> {
		this._store.clear();
	}

	/**
	 * Checks if a key exists in the store and is not expired.
	 * @param key - The key to check
	 * @returns True if the key exists and is not expired, false otherwise
	 */
	public async has(key: string): Promise<boolean> {
		const value = await this.get(key);
		return Boolean(value);
	}

	/**
	 * Retrieves multiple values from the store by their keys.
	 * @param keys - Array of keys to retrieve
	 * @returns Array of stored data in the same order as the input keys
	 */
	public async getMany<T>(keys: string[]): Promise<Array<StoredData<T | undefined>>> {
		const values = [];
		for (const key of keys) {
			const value = await this.get(key);
			values.push(value);
		}

		return values as Array<StoredData<T | undefined>>;
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
				const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
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
	 * @param namespace - Optional namespace to filter entries by
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

		const namespace = this.getNamespace();
		const iterator = (this._store as Map<any, any>).entries();

		for (const [key, data] of iterator) {
			// Filter by namespace if set
			if (namespace) {
				if (!key.startsWith(`${namespace}${this._keySeparator}`)) {
					continue;
				}
			}

			// Check expiration
			if (data && isDataExpired(data)) {
				this._store.delete(key);
				continue;
			}

			// Extract the key without namespace prefix
			const keyWithoutPrefix = namespace
				? key.slice(namespace.length + this._keySeparator.length)
				: key;

			yield [keyWithoutPrefix, data?.value];
		}
	}
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
	const memoryAdapter = new KeyvMemoryAdapter(store, options);
	const keyv = new Keyv({
		store: memoryAdapter,
		serialization: false,
	});
	return keyv;
}
