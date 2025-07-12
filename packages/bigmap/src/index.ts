import {Hookified, type HookifiedOptions} from 'hookified';

export type MapInterfacee<K, V> = {
	readonly size: number;
	clear(): void;
	delete(key: K): boolean;
	forEach(callbackfn: (value: V, key: K, map: MapInterfacee<K, V>) => void, thisArg?: any): void;
	entries(): IterableIterator<[K, V]>;
	keys(): IterableIterator<K>;
	values(): IterableIterator<V>;
	[Symbol.iterator](): IterableIterator<[K, V]>;
	get(key: K): V | undefined;
	has(key: K): boolean;
	set(key: K, value: V): Map<K, V>;
};

export type StoreHashFunction = ((key: string, storeSize: number) => number);

export function defaultHashFunction(key: string, storeSize: number): number {
	return djb2Hash(key, 0, storeSize - 1);
}

export function djb2Hash(string_: string, min = 0, max = 10): number {
	// DJB2 hash algorithm
	let hash = 5381;

	for (let i = 0; i < string_.length; i++) {
		// eslint-disable-next-line no-bitwise, unicorn/prefer-code-point
		hash = (hash * 33) ^ string_.charCodeAt(i); // 33 is a prime multiplier
	}

	// Calculate the range size
	const range = max - min + 1;

	// Return a value within the specified range
	return min + (Math.abs(hash) % range);
}

export type BigMapOptions<K, V> = {
	/**
	 * Optional size of the store. The default is 4 maps objects.
	 * @default 4
	 */
	storeSize?: number;
	/**
	 * Optional hash function to use for storing keys.
	 * @default undefined
	 */
	storeHashFunction?: StoreHashFunction;
} & HookifiedOptions;

export class BigMap<K, V> extends Hookified implements MapInterfacee<K, V> {
	private readonly map: Map<K, V>;
	private _size = 0;
	private _storeSize = 4;
	private _storeHashFunction?: StoreHashFunction;

	/**
	 * Creates an instance of BigMap.
	 * @param {BigMapOptions<K, V>} [options] - Optional configuration options for the BigMap.
	 */
	constructor(options?: BigMapOptions<K, V>) {
		super(options);
		this.map = new Map<K, V>();
		if (options?.storeSize !== undefined) {
			if (options.storeSize < 1) {
				throw new Error('Store size must be at least 1.');
			}

			this.storeSize = options.storeSize;
		}

		this._storeHashFunction = options?.storeHashFunction ?? defaultHashFunction;
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
			throw new Error('Store size must be at least 1.');
		}

		this._storeSize = size;
		this.clear();
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
		this._storeHashFunction = hashFunction ?? defaultHashFunction;
	}

	/**
	 * Returns an iterable of key-value pairs in the map.
	 * @returns {IterableIterator<[K, V]>} An iterable of key-value pairs in the map.
	 */
	public entries(): IterableIterator<[K, V]> {
		return this.map.entries();
	}

	/**
	 * Returns an iterable of keys in the map.
	 * @returns {IterableIterator<K>} An iterable of keys in the map.
	 */
	public keys(): IterableIterator<K> {
		return this.map.keys();
	}

	/**
	 * Returns an iterable of values in the map.
	 * @returns {IterableIterator<V>} An iterable of values in the map.
	 */
	public values(): IterableIterator<V> {
		return this.map.values();
	}

	/**
	 * Returns an iterator that iterates over the key-value pairs in the map.
	 * @returns {IterableIterator<[K, V]>} An iterator that iterates over the key-value pairs in the map.
	 */
	public [Symbol.iterator](): IterableIterator<[K, V]> {
		return this.map[Symbol.iterator]();
	}

	/**
	 * Clears all entries in the map.
	 * @returns {void} This method does not return a value.
	 */
	public clear(): void {
		this.map.clear();
		this._size = 0;
	}

	/**
	 * Deletes a key-value pair from the map.
	 * @param {K} key - The key of the entry to delete.
	 * @returns {boolean} Returns true if the entry was deleted, false if the key was not found.
	 */
	public delete(key: K): boolean {
		const deleted = this.map.delete(key);
		if (deleted) {
			this._size--;
		}

		return deleted;
	}

	/**
	 * Calls a provided callback function once for each key-value pair in the map.
	 * @param {function} callbackfn - The function to execute for each key-value pair.
	 * @param {any} [thisArg] - An optional value to use as `this` when executing the callback.
	 */
	public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
		// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
		this.map.forEach(callbackfn, thisArg);
	}

	/**
	 * Gets the value associated with the specified key.
	 * @param {K} key - The key of the entry to get.
	 * @returns {V | undefined} The value associated with the key, or undefined if the key does not exist.
	 */
	public get(key: K): V | undefined {
		return this.map.get(key);
	}

	/**
	 * Checks if the map contains a key.
	 * @param {K} key - The key to check for existence.
	 * @returns {boolean} Returns true if the key exists, false otherwise.
	 */
	public has(key: K): boolean {
		return this.map.has(key);
	}

	/**
	 * Sets the value for a key in the map.
	 * @param {K} key - The key of the entry to set.
	 * @param {V} value - The value to set for the entry.
	 * @returns {Map<K, V>} The map instance.
	 */
	public set(key: K, value: V): Map<K, V> {
		if (!this.map.has(key)) {
			this._size++;
		}

		this.map.set(key, value);
		return this.map;
	}

	/**
	 * Gets the number of entries in the map.
	 * @returns {number} The number of entries in the map.
	 */
	public get size(): number {
		return this._size;
	}
}
