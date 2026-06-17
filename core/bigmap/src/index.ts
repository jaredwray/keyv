import { Hookified, type HookifiedOptions } from "hookified";
import { Keyv } from "keyv";

/**
 * A subset of the native `Map` interface that {@link BigMap} implements.
 * @template K The type of the keys.
 * @template V The type of the values.
 */
export type MapInterface<K, V> = {
	readonly size: number;
	clear(): void;
	delete(key: K): boolean;
	forEach(
		callbackfn: (value: V, key: K, map: MapInterface<K, V>) => void,
		// biome-ignore lint/suspicious/noExplicitAny: MapInterface
		thisArg?: any,
	): void;
	entries(): IterableIterator<[K, V]>;
	keys(): IterableIterator<K>;
	values(): IterableIterator<V>;
	[Symbol.iterator](): IterableIterator<[K, V]>;
	get(key: K): V | undefined;
	has(key: K): boolean;
	set(key: K, value: V): MapInterface<K, V>;
};

/**
 * A hash function used to map a key to one of the internal store buckets.
 * @param {string} key The key to hash (non-string keys are coerced to a string).
 * @param {number} storeSize The total number of internal stores.
 * @returns {number} The index of the store to use, in the range `0` to `storeSize - 1`.
 */
export type StoreHashFunction = (key: string, storeSize: number) => number;

/**
 * Events emitted by {@link BigMap}. The class extends
 * {@link https://github.com/jaredwray/hookified | Hookified}, so you can subscribe
 * with `bigMap.on(BigMapEvents.SET, listener)`.
 */
export enum BigMapEvents {
	/** Emitted after a value is set. Listeners receive `(key, value)`. */
	SET = "set",
	/** Emitted after an existing entry is deleted. Listeners receive `(key)`. */
	DELETE = "delete",
	/** Emitted after all entries are cleared. Listeners receive no arguments. */
	CLEAR = "clear",
}

/**
 * O(1) hash function that samples characters from start, middle, and end of key.
 * Uses multiplicative hashing (Fibonacci) for good bit distribution across shards.
 * @param {string} key The key to hash.
 * @param {number} storeSize The total number of internal stores.
 * @returns {number} The store index for the key, in the range `0` to `storeSize - 1`.
 */
export function defaultHashFunction(key: string, storeSize: number): number {
	const len = key.length;
	// Sample up to 4 character positions and mix with length.
	// Each charCode is multiplied by a distinct prime so that repeated
	// indices (short keys where positions overlap) don't cancel out.
	const c0 = key.charCodeAt(0);
	const c1 = key.charCodeAt(len - 1);
	const c2 = key.charCodeAt(len >> 1);
	const c3 = key.charCodeAt(len >> 2);
	let h =
		Math.imul(len, 0x9e3779b9) +
		Math.imul(c0, 0x85ebca6b) +
		Math.imul(c1, 0xc2b2ae35) +
		Math.imul(c2, 0x27d4eb2f) +
		Math.imul(c3, 0x165667b1);
	// Final avalanche mix (murmur3 finalizer)
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;

	// Power-of-2 fast path: bitwise AND instead of modulo
	if ((storeSize & (storeSize - 1)) === 0) {
		return (h >>> 0) & (storeSize - 1);
	}

	return (h >>> 0) % storeSize;
}

/**
 * Configuration options for {@link BigMap}.
 */
export type BigMapOptions = {
	/**
	 * Number of internal `Map` instances used to store entries. Must be at least 1.
	 * @default 2
	 */
	storeSize?: number;
	/**
	 * Custom hash function used to distribute keys across the internal stores.
	 * Defaults to {@link defaultHashFunction} when not provided.
	 * @default defaultHashFunction
	 */
	storeHashFunction?: StoreHashFunction;
} & HookifiedOptions;

/**
 * A scalable `Map` implementation that distributes entries across multiple internal
 * `Map` instances, allowing it to scale beyond the ~16.7 million entry limit of a
 * native `Map`. It mirrors the native `Map` API and emits {@link BigMapEvents} on
 * mutations via its {@link https://github.com/jaredwray/hookified | Hookified} base.
 * @template K The type of the keys.
 * @template V The type of the values.
 * @example
 * ```typescript
 * const bigMap = new BigMap<string, number>();
 * bigMap.on(BigMapEvents.SET, (key, value) => console.log(key, value));
 * bigMap.set("key", 100);
 * ```
 */
export class BigMap<K, V> extends Hookified implements MapInterface<K, V> {
	private _storeSize!: number;
	private _store!: Array<Map<K, V>>;
	private _storeHashFunction!: StoreHashFunction;
	private _isDefaultHash = true;
	private _isPowerOf2 = true;

	/**
	 * Creates an instance of BigMap.
	 * @param {BigMapOptions} [options] - Optional configuration options for the BigMap.
	 * @throws {Error} If `storeSize` is less than 1.
	 */
	constructor(options?: BigMapOptions) {
		super(options);
		const size = options?.storeSize ?? 2;
		if (size < 1) {
			throw new Error("Store size must be at least 1.");
		}

		this._storeSize = size;
		this._isPowerOf2 = (size & (size - 1)) === 0;
		this.initStore();

		if (options?.storeHashFunction) {
			this._storeHashFunction = options.storeHashFunction;
			this._isDefaultHash = false;
		} else {
			this._storeHashFunction = defaultHashFunction;
			this._isDefaultHash = true;
		}
	}

	/**
	 * Gets the number of internal `Map` instances in the store.
	 * @returns {number} The number of maps in the store.
	 */
	public get storeSize(): number {
		return this._storeSize;
	}

	/**
	 * Sets the number of internal `Map` instances in the store.
	 * Changing the store size clears all existing entries and emits
	 * {@link BigMapEvents.CLEAR}.
	 * @param {number} size - The new size of the store.
	 * @throws {Error} If the size is less than 1.
	 */
	public set storeSize(size: number) {
		if (size < 1) {
			throw new Error("Store size must be at least 1.");
		}

		this._storeSize = size;
		this._isPowerOf2 = (size & (size - 1)) === 0;
		this.initStore();
		this.emit(BigMapEvents.CLEAR);
	}

	/**
	 * Gets the hash function used for distributing keys across the store.
	 * @returns {StoreHashFunction | undefined} The active hash function.
	 */
	public get storeHashFunction(): StoreHashFunction | undefined {
		return this._storeHashFunction;
	}

	/**
	 * Sets the hash function used for distributing keys across the store.
	 * Passing `undefined` restores the {@link defaultHashFunction}.
	 * @param {StoreHashFunction | undefined} hashFunction - The hash function to use, or `undefined` to reset to the default.
	 */
	public set storeHashFunction(hashFunction: StoreHashFunction | undefined) {
		if (hashFunction) {
			this._storeHashFunction = hashFunction;
			this._isDefaultHash = false;
		} else {
			this._storeHashFunction = defaultHashFunction;
			this._isDefaultHash = true;
		}
	}

	/**
	 * Gets the internal store, which is an array of `Map` instances.
	 * @returns {Array<Map<K, V>>} The array of maps in the store.
	 */
	public get store(): Array<Map<K, V>> {
		return this._store;
	}

	/**
	 * Gets the total number of entries across all internal stores.
	 * @returns {number} The number of entries in the map.
	 */
	public get size(): number {
		let total = 0;
		for (let i = 0; i < this._storeSize; i++) {
			total += this._store[i].size;
		}

		return total;
	}

	/**
	 * Gets the internal `Map` instance at the specified index in the store.
	 * @param {number} index - The index of the map to retrieve.
	 * @returns {Map<K, V>} The map at the specified index.
	 * @throws {Error} If the index is out of bounds.
	 */
	public getStoreMap(index: number): Map<K, V> {
		if (index < 0 || index >= this._storeSize) {
			throw new Error(`Index out of bounds: ${index}. Valid range is 0 to ${this._storeSize - 1}.`);
		}

		return this._store[index];
	}

	/**
	 * Initializes the store with empty `Map` instances.
	 * Called automatically during construction and whenever `storeSize` changes.
	 * @returns {void}
	 */
	public initStore(): void {
		this._store = Array.from({ length: this._storeSize }, () => new Map<K, V>());
	}

	/**
	 * Gets the internal `Map` instance that holds the given key. The bucket is
	 * resolved by applying the hash function to the key and the store size.
	 * @param {K} key - The key for which to resolve the store.
	 * @returns {Map<K, V>} The store that holds (or would hold) the key.
	 */
	public getStore(key: K): Map<K, V> {
		if (this._storeSize === 1) {
			return this._store[0];
		}

		return this._resolve(typeof key === "string" ? key : String(key));
	}

	/**
	 * Returns an iterable of key-value pairs for every entry in the map.
	 * @returns {IterableIterator<[K, V]>} An iterable of key-value pairs in the map.
	 */
	public *entries(): IterableIterator<[K, V]> {
		for (const store of this._store) {
			yield* store.entries();
		}
	}

	/**
	 * Returns an iterable of the keys in the map.
	 * @returns {IterableIterator<K>} An iterable of keys in the map.
	 */
	public *keys(): IterableIterator<K> {
		for (const store of this._store) {
			yield* store.keys();
		}
	}

	/**
	 * Returns an iterable of the values in the map.
	 * @returns {IterableIterator<V>} An iterable of values in the map.
	 */
	public *values(): IterableIterator<V> {
		for (const store of this._store) {
			yield* store.values();
		}
	}

	/**
	 * Returns an iterator over the key-value pairs in the map. Enables `for...of`.
	 * @returns {IterableIterator<[K, V]>} An iterator over the key-value pairs in the map.
	 */
	public *[Symbol.iterator](): IterableIterator<[K, V]> {
		yield* this.entries();
	}

	/**
	 * Removes all entries from the map and emits {@link BigMapEvents.CLEAR}.
	 * @returns {void}
	 */
	public clear(): void {
		for (const store of this._store) {
			store.clear();
		}

		this.emit(BigMapEvents.CLEAR);
	}

	/**
	 * Deletes a key-value pair from the map. Emits {@link BigMapEvents.DELETE}
	 * with the key when an entry is removed.
	 * @param {K} key - The key of the entry to delete.
	 * @returns {boolean} `true` if an entry was deleted, `false` if the key was not found.
	 */
	public delete(key: K): boolean {
		const deleted =
			this._storeSize === 1
				? this._store[0].delete(key)
				: this._resolve(typeof key === "string" ? key : String(key)).delete(key);

		if (deleted) {
			this.emit(BigMapEvents.DELETE, key);
		}

		return deleted;
	}

	/**
	 * Calls a provided callback once for each key-value pair in the map.
	 * @param {(value: V, key: K, map: Map<K, V>) => void} callbackfn - The function to execute for each entry, receiving the value, key, and the map.
	 * @param {any} [thisArg] - An optional value to use as `this` when executing the callback.
	 * @returns {void}
	 */
	public forEach(
		// biome-ignore lint/suspicious/noExplicitAny: MapInterface
		callbackfn: (this: any, value: V, key: K, map: Map<K, V>) => void,
		// biome-ignore lint/suspicious/noExplicitAny: MapInterface
		thisArg?: any,
	): void {
		for (const store of this._store) {
			for (const [key, value] of store) {
				callbackfn.call(thisArg, value, key, this as unknown as Map<K, V>);
			}
		}
	}

	/**
	 * Gets the value associated with the specified key.
	 * @param {K} key - The key of the entry to get.
	 * @returns {V | undefined} The value associated with the key, or `undefined` if the key does not exist.
	 */
	public get(key: K): V | undefined {
		if (this._storeSize === 1) {
			return this._store[0].get(key);
		}

		return this._resolve(typeof key === "string" ? key : String(key)).get(key);
	}

	/**
	 * Checks whether the map contains the specified key.
	 * @param {K} key - The key to check for existence.
	 * @returns {boolean} `true` if the key exists, `false` otherwise.
	 */
	public has(key: K): boolean {
		if (this._storeSize === 1) {
			return this._store[0].has(key);
		}

		return this._resolve(typeof key === "string" ? key : String(key)).has(key);
	}

	/**
	 * Sets the value for a key in the map and emits {@link BigMapEvents.SET}
	 * with the key and value.
	 * @param {K} key - The key of the entry to set.
	 * @param {V} value - The value to associate with the key.
	 * @returns {this} The BigMap instance, enabling method chaining (matches the native `Map.set` API).
	 */
	public set(key: K, value: V): this {
		const store =
			this._storeSize === 1
				? this._store[0]
				: this._resolve(typeof key === "string" ? key : String(key));

		store.set(key, value);
		this.emit(BigMapEvents.SET, key, value);
		return this;
	}

	/**
	 * Resolves the shard Map for a string key. Inlines the default hash
	 * to avoid function call overhead on the hot path.
	 * @param {string} k - The string key to resolve.
	 * @returns {Map<K, V>} The store that holds (or would hold) the key.
	 */
	private _resolve(k: string): Map<K, V> {
		if (this._isDefaultHash) {
			const len = k.length;
			const c0 = k.charCodeAt(0);
			const c1 = k.charCodeAt(len - 1);
			const c2 = k.charCodeAt(len >> 1);
			const c3 = k.charCodeAt(len >> 2);
			let h =
				Math.imul(len, 0x9e3779b9) +
				Math.imul(c0, 0x85ebca6b) +
				Math.imul(c1, 0xc2b2ae35) +
				Math.imul(c2, 0x27d4eb2f) +
				Math.imul(c3, 0x165667b1);
			h ^= h >>> 16;
			h = Math.imul(h, 0x85ebca6b);
			h ^= h >>> 13;
			return this._isPowerOf2
				? this._store[(h >>> 0) & (this._storeSize - 1)]
				: this._store[(h >>> 0) % this._storeSize];
		}

		const raw = this._storeHashFunction(k, this._storeSize);
		return this._store[Math.abs(Math.floor(raw)) % this._storeSize];
	}
}

/**
 * Will create a Keyv instance with the BigMap adapter.
 * @param {BigMapOptions} [options] - Options for the BigMap adapter such as `storeSize` and `storeHashFunction`.
 * @returns {Keyv} A Keyv instance backed by the BigMap adapter.
 */
export function createKeyv<K = string, V = unknown>(options?: BigMapOptions): Keyv {
	const adapter = new BigMap<K, V>(options);
	const keyv = new Keyv({ store: adapter });

	return keyv;
}

export { Hashery } from "hashery";
export { Keyv } from "keyv";
