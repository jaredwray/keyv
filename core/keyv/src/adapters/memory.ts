import { Hookified } from "hookified";
import { detectKeyvStorage, type KeyvStorageCapability } from "../capabilities.js";
import { Keyv } from "../keyv.js";
import type { KeyvStorageAdapter, KeyvStorageGetResult } from "../types/adapters.js";
import {
	type KeyvAny,
	type KeyvAnyArray,
	KeyvEvents,
	type KeyvStorageEntry,
} from "../types/keyv.js";
import { ttlFromExpires } from "../utils.js";

/**
 * The longest delay Node.js timers accept, about 24.8 days. Node runs a timer with a longer
 * delay after 1 ms instead.
 */
const maxTimerDelay = 2_147_483_647;

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
 * Whether an entry has passed its absolute expiry.
 * @param entry - The stored entry, or `undefined` when there is none
 * @returns True if the entry has an expiry and it is in the past
 */
function isExpired(entry: MemoryEntry | undefined): boolean {
	return entry?.expires !== undefined && Date.now() > entry.expires;
}

/**
 * Configuration options for KeyvMemoryAdapter.
 */
export type KeyvMemoryAdapterOptions = {
	/**
	 * The namespace to use for keys.
	 * When set, all keys will be prefixed with the namespace followed by the namespace separator.
	 */
	namespace?: string;
	/**
	 * The separator between the namespace and the key. Defaults to `::`.
	 */
	namespaceSeparator?: string;
	/**
	 * Interval in milliseconds between automatic sweeps that delete expired entries.
	 * `0` (default) disables the timer; expired entries are then removed only when read.
	 * On a store split into several internal Maps, such as BigMap, each sweep covers one of them.
	 */
	clearExpiredInterval?: number;
};

/**
 * Interface for a Map-like store that can be used with KeyvMemoryAdapter.
 * This allows any object implementing these methods to be used as the underlying storage.
 * Compatible with Map, QuickLRU, lru.min, and other LRU cache implementations.
 */
export type KeyvMapType = {
	/** Retrieves a value by key */
	get: (key: string) => KeyvAny;
	/** Sets a value with a key. Additional parameters (like TTL) vary by implementation. */
	set: (key: string, value: KeyvAny, ...args: KeyvAnyArray) => KeyvAny;
	/** Deletes a key from the store */
	delete: (key: string) => boolean;
	/** Clears all entries from the store */
	clear: () => void;
	/** Checks if a key exists in the store */
	has: (key: string) => boolean;
};

/**
 * A Map-like store split into several internal Maps, such as BigMap. The
 * `clearExpiredInterval` timer sweeps one of them per tick instead of the whole store.
 */
type KeyvShardedMapType = KeyvMapType & {
	storeSize: number;
	getStoreMap: (index: number) => Map<KeyvAny, KeyvAny>;
};

function isShardedStore(store: KeyvMapType): store is KeyvShardedMapType {
	const sharded = store as Partial<KeyvShardedMapType>;
	return (
		typeof sharded.storeSize === "number" &&
		sharded.storeSize >= 1 &&
		typeof sharded.getStoreMap === "function"
	);
}

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
 * Expired entries are removed when read, or on a timer with the `clearExpiredInterval` option.
 *
 * @example
 * ```typescript
 * // Using with a standard Map
 * const store = new KeyvMemoryAdapter(new Map(), { namespace: 'cache' });
 *
 * // Using with a custom store
 * const customStore = new KeyvMemoryAdapter(myCustomMapLikeStore, {
 *   namespace: 'tenant-123',
 *   namespaceSeparator: '::'
 * });
 * ```
 */
export class KeyvMemoryAdapter extends Hookified implements KeyvStorageAdapter {
	private _store: KeyvMapType;
	private _namespace?: string;
	private _namespaceSeparator = "::";
	private readonly _capabilities: KeyvStorageCapability;

	/**
	 * The interval in milliseconds between automatic sweeps that delete expired entries.
	 * A value of 0 (default) disables the automatic sweep.
	 * @default 0
	 */
	private _clearExpiredInterval = 0;

	/** The timer reference for the automatic expired-entry sweep. */
	private _clearExpiredTimer?: ReturnType<typeof setInterval>;

	/** The internal Map of a sharded store that the next timer tick sweeps. */
	private _clearExpiredShard = 0;

	/**
	 * Creates a new KeyvMemoryAdapter instance.
	 * @param store - The underlying Map or Map-like object to use for storage
	 * @param options - Configuration options for the store
	 */
	constructor(store: KeyvMapType, options?: KeyvMemoryAdapterOptions) {
		super({ throwOnHookError: false });
		this._store = store;
		this._capabilities = detectKeyvStorage(store);

		if (options?.namespaceSeparator !== undefined) {
			this._namespaceSeparator = options.namespaceSeparator;
		}

		if (options?.namespace) {
			this._namespace = options?.namespace;
		}

		if (options?.clearExpiredInterval !== undefined) {
			this.clearExpiredInterval = options.clearExpiredInterval;
		}
	}

	/**
	 * Gets the capabilities of the underlying store, with `expires: true` to declare that
	 * this adapter accepts an absolute `expires` timestamp (the v6 storage contract).
	 */
	public get capabilities(): KeyvStorageCapability {
		return { ...this._capabilities, expires: true };
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
	 * Gets the separator between the namespace and the key. Defaults to `::`.
	 */
	public get namespaceSeparator() {
		return this._namespaceSeparator;
	}

	/**
	 * Sets the separator between the namespace and the key.
	 */
	public set namespaceSeparator(separator: string) {
		this._namespaceSeparator = separator;
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
	 * Gets the interval in milliseconds between automatic sweeps that delete expired entries.
	 * @returns {number} The sweep interval in milliseconds, or `0` when the sweep is off.
	 * @default 0
	 */
	public get clearExpiredInterval(): number {
		return this._clearExpiredInterval;
	}

	/**
	 * Sets the interval in milliseconds between automatic sweeps that delete expired entries, and
	 * restarts the timer. `0` turns it off. Each sweep covers the whole store, or one internal Map
	 * of a store split into several, such as BigMap. The timer uses `unref()`, so it won't keep the
	 * Node.js process alive. An interval longer than about 24.8 days, the longest delay Node.js
	 * timers accept, runs at that limit. {@link disconnect} stops the timer.
	 * @param {number} value - The sweep interval in milliseconds (`0` to disable).
	 */
	public set clearExpiredInterval(value: number) {
		this._clearExpiredInterval = value;
		this.startClearExpiredTimer();
	}

	/**
	 * Creates a prefixed key by combining the namespace and key with the separator.
	 * @param key - The base key
	 * @param namespace - Optional namespace to prefix the key with
	 * @returns The prefixed key if namespace is provided, otherwise the original key
	 */
	public getKeyPrefix(key: string, namespace?: string) {
		if (namespace) {
			return `${namespace}${this._namespaceSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Parses a prefixed key to extract the namespace and original key.
	 * @param key - The prefixed key to parse
	 * @returns An object containing the namespace (if present) and the original key
	 */
	public getKeyPrefixData(key: string) {
		if (this._namespace && key.startsWith(`${this._namespace}${this._namespaceSeparator}`)) {
			return {
				namespace: this._namespace,
				key: key.slice(this._namespace.length + this._namespaceSeparator.length),
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

		if (isExpired(entry)) {
			this._store.delete(keyPrefix);
			return undefined;
		}

		return entry.value as KeyvStorageGetResult<T>;
	}

	/**
	 * Stores a value in the store with an optional absolute expiry.
	 * @param key - The key to store the value under
	 * @param value - The value to store
	 * @param expires - Optional absolute expiry as Unix ms since epoch
	 * @returns Always returns true indicating success
	 */
	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this._namespace);
		const entry: MemoryEntry = {
			value,
			expires: typeof expires === "number" ? expires : undefined,
		};
		// A Map/LRU underlay (e.g. QuickLRU) expects a relative duration, so derive it here.
		this._store.set(keyPrefix, entry, ttlFromExpires(expires));
		return true;
	}

	/**
	 * Stores multiple entries in the store at once.
	 * @param entries - Array of entries containing key, value, and optional absolute `expires`
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		const results: boolean[] = [];
		for (const entry of entries) {
			const keyPrefix = this.getKeyPrefix(entry.key, this._namespace);
			const memEntry: MemoryEntry = {
				value: entry.value,
				expires: typeof entry.expires === "number" ? entry.expires : undefined,
			};
			this._store.set(keyPrefix, memEntry, ttlFromExpires(entry.expires));
			results.push(true);
		}

		return results;
	}

	/**
	 * Deletes a value from the store by key. An expired entry is deleted too, but reported as
	 * missing, as `get` and `has` do.
	 * @param key - The key to delete
	 * @returns True if the key held a value that had not expired, false otherwise
	 */
	public async delete(key: string): Promise<boolean> {
		return this.deleteEntry(key);
	}

	/**
	 * Clears entries from the store. With no namespace, the whole store is cleared. With a
	 * namespace, only that namespace's entries are removed, found through the store's `keys()`.
	 * A store without `keys()` can't tell namespaces apart, so this throws rather than call the
	 * store's `clear()` and delete every namespace's entries.
	 * @throws {Error} If a namespace is set and the store has no `keys()`.
	 */
	public async clear(): Promise<void> {
		if (!this._namespace) {
			this._store.clear();
			return;
		}

		if (typeof (this._store as Map<KeyvAny, KeyvAny>).keys !== "function") {
			throw new Error(
				`Can't clear namespace "${this._namespace}": the store has no keys() to find that namespace's keys, and its clear() would delete every namespace. Use a store with keys(), such as a Map, or clear it without a namespace.`,
			);
		}

		const prefix = `${this._namespace}${this._namespaceSeparator}`;
		const keysToDelete: string[] = [];
		for (const key of (this._store as Map<KeyvAny, KeyvAny>).keys()) {
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

		if (isExpired(entry)) {
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

			if (isExpired(entry)) {
				this._store.delete(keyPrefix);
				values.push(undefined as KeyvStorageGetResult<T | undefined>);
				continue;
			}

			values.push(entry.value as KeyvStorageGetResult<T | undefined>);
		}

		return values;
	}

	/**
	 * Deletes multiple keys from the store at once. Expired entries are deleted too, but
	 * reported as missing.
	 * @param keys - Array of keys to delete
	 * @returns Array of booleans, true for each key that held a value that had not expired
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const results: boolean[] = [];
		for (const key of keys) {
			try {
				results.push(await this.deleteEntry(key));
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
		if (typeof (this._store as Map<KeyvAny, KeyvAny>).entries !== "function") {
			return;
		}

		const namespace = this._namespace;

		for (const [key, raw] of (this._store as Map<KeyvAny, KeyvAny>).entries()) {
			// Filter by namespace if set
			if (namespace) {
				if (!key.startsWith(`${namespace}${this._namespaceSeparator}`)) {
					continue;
				}
			}

			const entry = raw as MemoryEntry;

			// Check expiration
			if (isExpired(entry)) {
				this._store.delete(key);
				continue;
			}

			// Extract the key without namespace prefix
			const keyWithoutPrefix = namespace
				? key.slice(namespace.length + this._namespaceSeparator.length)
				: key;

			yield [keyWithoutPrefix, entry?.value];
		}
	}

	/**
	 * Deletes every expired entry in the store, or in the current namespace when one is set.
	 * Unlike the {@link clearExpiredInterval} timer, which sweeps one internal Map per tick on a
	 * store split into several (such as BigMap), this sweeps all of them. A store without
	 * `entries()` can't be enumerated, so nothing is deleted. `@keyv/sqlite`'s `clearExpired()`
	 * resolves `void`; this one resolves with the number of entries deleted.
	 * @returns {Promise<number>} The number of expired entries deleted.
	 */
	public async clearExpired(): Promise<number> {
		const store = this._store;
		const now = Date.now();
		if (!isShardedStore(store)) {
			return this.sweepStore(now);
		}

		let deleted = 0;
		for (let index = 0; index < store.storeSize; index++) {
			deleted += this.sweepEntries(store.getStoreMap(index).entries(), now);
		}

		return deleted;
	}

	/**
	 * Stops the {@link clearExpiredInterval} timer. The stored entries are kept.
	 */
	public async disconnect(): Promise<void> {
		this.stopClearExpiredTimer();
	}

	/**
	 * Starts (or restarts) the timer that deletes expired entries every
	 * {@link clearExpiredInterval} milliseconds. Does nothing when the interval is not positive.
	 * @returns {void}
	 */
	private startClearExpiredTimer(): void {
		this.stopClearExpiredTimer();
		if (this._clearExpiredInterval > 0) {
			const delay = Math.min(this._clearExpiredInterval, maxTimerDelay);
			this._clearExpiredTimer = setInterval(() => {
				try {
					this.sweepNextShard();
				} catch (error) {
					// A background sweep must not crash the process. Hookified throws when `error` has
					// no listener, both here and on a Keyv instance that re-emits this adapter's errors.
					try {
						this.emit(KeyvEvents.ERROR, error);
					} catch {
						// Nothing is listening for errors, so the error is dropped.
					}
				}
			}, delay);
			// Browsers return a number, which has no unref().
			(this._clearExpiredTimer as { unref?: () => void }).unref?.();
		}
	}

	/**
	 * Stops the expired-entry timer, if one is running.
	 * @returns {void}
	 */
	private stopClearExpiredTimer(): void {
		if (this._clearExpiredTimer) {
			clearInterval(this._clearExpiredTimer);
			this._clearExpiredTimer = undefined;
		}
	}

	/**
	 * Runs one tick of the expired-entry timer. A store split into several internal Maps, such as
	 * BigMap, has one of them swept per tick, in turn; any other store is swept whole.
	 * @returns {void}
	 */
	private sweepNextShard(): void {
		const store = this._store;
		if (!isShardedStore(store)) {
			this.sweepStore(Date.now());
			return;
		}

		// The store can shrink between ticks, leaving the cursor past the end.
		if (this._clearExpiredShard >= store.storeSize) {
			this._clearExpiredShard = 0;
		}

		const index = this._clearExpiredShard;
		// Advance first, so a shard that throws doesn't stop the others from being swept.
		this._clearExpiredShard = (index + 1) % store.storeSize;
		this.sweepEntries(store.getStoreMap(index).entries(), Date.now());
	}

	/**
	 * Deletes the expired entries of the whole store, found through its `entries()`.
	 * @param {number} now - The current time in milliseconds since the epoch.
	 * @returns {number} The number of entries deleted, or `0` when the store has no `entries()`.
	 */
	private sweepStore(now: number): number {
		if (typeof (this._store as Map<KeyvAny, KeyvAny>).entries !== "function") {
			return 0;
		}

		return this.sweepEntries((this._store as Map<KeyvAny, KeyvAny>).entries(), now);
	}

	/**
	 * Deletes the expired entries among `entries`, skipping keys outside the current namespace.
	 * The keys are collected first and deleted after the loop, because some stores' iterators, such
	 * as lru.min's, break when an entry is deleted during iteration.
	 * @param {Iterable<[KeyvAny, KeyvAny]>} entries - The `[key, entry]` pairs to check.
	 * @param {number} now - The current time in milliseconds since the epoch.
	 * @returns {number} The number of entries deleted.
	 */
	private sweepEntries(entries: Iterable<[KeyvAny, KeyvAny]>, now: number): number {
		const prefix = this._namespace ? `${this._namespace}${this._namespaceSeparator}` : undefined;
		const expiredKeys: string[] = [];
		for (const [key, entry] of entries) {
			if (prefix && (typeof key !== "string" || !key.startsWith(prefix))) {
				continue;
			}

			const expires = (entry as MemoryEntry | null | undefined)?.expires;
			if (typeof expires === "number" && now > expires) {
				expiredKeys.push(key);
			}
		}

		for (const key of expiredKeys) {
			this._store.delete(key);
		}

		return expiredKeys.length;
	}

	/**
	 * Deletes a key's entry, expired or not.
	 * @param key - The key to delete
	 * @returns True if the key held an entry that had not expired
	 */
	private async deleteEntry(key: string): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this._namespace);
		const entry = this._store.get(keyPrefix) as MemoryEntry | undefined;
		// Awaited in case the store's delete returns a promise, so its rejection reaches the caller.
		await this._store.delete(keyPrefix);
		return entry !== undefined && entry !== null && !isExpired(entry);
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
 *   namespaceSeparator: '::'
 * });
 *
 * // Delete expired entries every minute, even if they are never read again
 * const sweptCache = createKeyv(new Map(), { clearExpiredInterval: 60_000 });
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
