import { Hookified, type HookifiedOptions } from "hookified";
import { Keyv } from "keyv";

export type MapInterfacee<K, V> = {
	readonly size: number;
	clear(): void;
	delete(key: K): boolean;
	forEach(
		callbackfn: (value: V, key: K, map: MapInterfacee<K, V>) => void,
		// biome-ignore lint/suspicious/noExplicitAny: MapInterface
		thisArg?: any,
	): void;
	entries(): IterableIterator<[K, V]>;
	keys(): IterableIterator<K>;
	values(): IterableIterator<V>;
	[Symbol.iterator](): IterableIterator<[K, V]>;
	get(key: K): V | undefined;
	has(key: K): boolean;
	set(key: K, value: V): Map<K, V>;
};

export type StoreHashFunction = (key: string, storeSize: number) => number;

/**
 * O(1) hash function that samples characters from start, middle, and end of key.
 * Uses multiplicative hashing (Fibonacci) for good bit distribution across shards.
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
	let h = Math.imul(len, 0x9e3779b9)
		+ Math.imul(c0, 0x85ebca6b)
		+ Math.imul(c1, 0xc2b2ae35)
		+ Math.imul(c2, 0x27d4eb2f)
		+ Math.imul(c3, 0x165667b1);
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

export type BigMapOptions = {
	/**
	 * Optional size of the store. The default is 2 maps objects.
	 * @default 2
	 */
	storeSize?: number;
	/**
	 * Optional hash function to use for storing keys.
	 * @default undefined
	 */
	storeHashFunction?: StoreHashFunction;
} & HookifiedOptions;

export class BigMap<K, V> extends Hookified implements MapInterfacee<K, V> {
	private _storeSize!: number;
	private _store!: Array<Map<K, V>>;
	private _storeHashFunction!: StoreHashFunction;
	private _isDefaultHash = true;
	private _isPowerOf2 = true;

	/**
	 * Creates an instance of BigMap.
	 * @param {BigMapOptions<K, V>} [options] - Optional configuration options for the BigMap.
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
	 * Resolves the shard Map for a string key. Inlines the default hash
	 * to avoid function call overhead on the hot path.
	 */
	private _resolve(k: string): Map<K, V> {
		if (this._isDefaultHash) {
			const len = k.length;
			const c0 = k.charCodeAt(0);
			const c1 = k.charCodeAt(len - 1);
			const c2 = k.charCodeAt(len >> 1);
			const c3 = k.charCodeAt(len >> 2);
			let h = Math.imul(len, 0x9e3779b9)
				+ Math.imul(c0, 0x85ebca6b)
				+ Math.imul(c1, 0xc2b2ae35)
				+ Math.imul(c2, 0x27d4eb2f)
				+ Math.imul(c3, 0x165667b1);
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

	/**
	 * Gets the number of maps in the store.
	 * @returns {number} The number of maps in the store.
	 */
	public get storeSize(): number {
		return this._storeSize;
	}

	/**
	 * Sets the number of maps in the store. If the size is less than 1, an error is thrown.
	 * If you change the store size it will clear all entries.
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
	}

	/**
	 * Gets the hash function used for storing keys.
	 * @returns {StoreHashFunction | undefined} The hash function used for storing keys, or undefined if not set.
	 */
	public get storeHashFunction(): StoreHashFunction | undefined {
		return this._storeHashFunction;
	}

	/**
	 * Sets the hash function used for storing keys.
	 * @param {StoreHashFunction} hashFunction - The hash function to use for storing keys.
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
	 * Gets the store, which is an array of maps.
	 * @returns {Array<Map<K, V>>} The array of maps in the store.
	 */
	public get store(): Array<Map<K, V>> {
		return this._store;
	}

	/**
	 * Gets the map at the specified index in the store.
	 * @param {number} index - The index of the map to retrieve.
	 * @returns {Map<K, V>} The map at the specified index.
	 */
	public getStoreMap(index: number): Map<K, V> {
		if (index < 0 || index >= this._storeSize) {
			throw new Error(`Index out of bounds: ${index}. Valid range is 0 to ${this._storeSize - 1}.`);
		}

		return this._store[index];
	}

	/**
	 * Initializes the store with empty maps.
	 * This method is called when the BigMap instance is created.
	 */
	public initStore(): void {
		this._store = Array.from({ length: this._storeSize }, () => new Map<K, V>());
	}

	/**
	 * Gets the store for a specific key.
	 * The store is determined by applying the hash function to the key and the store size.
	 * If the hash function is not set, it defaults to using the default hash function.
	 * @param key - The key for which to get the store.
	 * @returns The store for the specified key.
	 */
	public getStore(key: K): Map<K, V> {
		if (this._storeSize === 1) {
			return this._store[0];
		}

		return this._resolve(typeof key === "string" ? key : String(key));
	}

	/**
	 * Returns an iterable of key-value pairs in the map.
	 * @returns {IterableIterator<[K, V]>} An iterable of key-value pairs in the map.
	 */
	public *entries(): IterableIterator<[K, V]> {
		for (const store of this._store) {
			yield* store.entries();
		}
	}

	/**
	 * Returns an iterable of keys in the map.
	 * @returns {IterableIterator<K>} An iterable of keys in the map.
	 */
	public *keys(): IterableIterator<K> {
		for (const store of this._store) {
			yield* store.keys();
		}
	}

	/**
	 * Returns an iterable of values in the map.
	 * @returns {IterableIterator<V>} An iterable of values in the map.
	 */
	public *values(): IterableIterator<V> {
		for (const store of this._store) {
			yield* store.values();
		}
	}

	/**
	 * Returns an iterator that iterates over the key-value pairs in the map.
	 * @returns {IterableIterator<[K, V]>} An iterator that iterates over the key-value pairs in the map.
	 */
	public *[Symbol.iterator](): IterableIterator<[K, V]> {
		yield* this.entries();
	}

	/**
	 * Clears all entries in the map.
	 * @returns {void} This method does not return a value.
	 */
	public clear(): void {
		for (const store of this._store) {
			store.clear();
		}
	}

	/**
	 * Deletes a key-value pair from the map.
	 * @param {K} key - The key of the entry to delete.
	 * @returns {boolean} Returns true if the entry was deleted, false if the key was not found.
	 */
	public delete(key: K): boolean {
		if (this._storeSize === 1) {
			return this._store[0].delete(key);
		}

		return this._resolve(typeof key === "string" ? key : String(key)).delete(key);
	}

	/**
	 * Calls a provided callback function once for each key-value pair in the map.
	 * @param {function} callbackfn - The function to execute for each key-value pair.
	 * @param {any} [thisArg] - An optional value to use as `this` when executing the callback.
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
	 * @returns {V | undefined} The value associated with the key, or undefined if the key does not exist.
	 */
	public get(key: K): V | undefined {
		if (this._storeSize === 1) {
			return this._store[0].get(key);
		}

		return this._resolve(typeof key === "string" ? key : String(key)).get(key);
	}

	/**
	 * Checks if the map contains a key.
	 * @param {K} key - The key to check for existence.
	 * @returns {boolean} Returns true if the key exists, false otherwise.
	 */
	public has(key: K): boolean {
		if (this._storeSize === 1) {
			return this._store[0].has(key);
		}

		return this._resolve(typeof key === "string" ? key : String(key)).has(key);
	}

	/**
	 * Sets the value for a key in the map.
	 * @param {K} key - The key of the entry to set.
	 * @param {V} value - The value to set for the entry.
	 * @returns {Map<K, V>} The map instance.
	 */
	public set(key: K, value: V): Map<K, V> {
		let store: Map<K, V>;
		if (this._storeSize === 1) {
			store = this._store[0];
		} else {
			store = this._resolve(typeof key === "string" ? key : String(key));
		}

		store.set(key, value);
		return store;
	}

	/**
	 * Gets the number of entries in the map. Computed from underlying stores.
	 * @returns {number} The number of entries in the map.
	 */
	public get size(): number {
		let total = 0;
		for (let i = 0; i < this._storeSize; i++) {
			total += this._store[i].size;
		}

		return total;
	}
}

/**
 * Will create a Keyv instance with the BigMap adapter.
 * @param {BigMapOptions} options - Options for the BigMap adapter such as storeSize and storeHashFunction.
 * @returns {Keyv} - Keyv instance with the BigMap adapter
 */
export function createKeyv<K = string, V = unknown>(options?: BigMapOptions): Keyv {
	const adapter = new BigMap<K, V>(options);
	const keyv = new Keyv({ store: adapter });

	return keyv;
}

export { Hashery } from "hashery";
export { Keyv } from "keyv";
