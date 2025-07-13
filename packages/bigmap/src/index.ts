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
	private _storeSize = 4;
	private _store = Array.from({length: this._storeSize}, () => new Map<K, V>());
	private _storeHashFunction?: StoreHashFunction;

	/**
	 * Creates an instance of BigMap.
	 * @param {BigMapOptions<K, V>} [options] - Optional configuration options for the BigMap.
	 */
	constructor(options?: BigMapOptions<K, V>) {
		super(options);
		if (options?.storeSize !== undefined) {
			if (options.storeSize < 1) {
				throw new Error('Store size must be at least 1.');
			}

			this.storeSize = options.storeSize;
		}

		this.initStore();

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
		this._storeHashFunction = hashFunction ?? defaultHashFunction;
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
		this._store = Array.from({length: this._storeSize}, () => new Map<K, V>());
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
			return this.getStoreMap(0);
		}

		const storeSize = this._storeSize - 1; // Adjust for zero-based index

		const index = this._storeHashFunction ? this._storeHashFunction(String(key), storeSize) : defaultHashFunction(String(key), storeSize);

		return this.getStoreMap(index);
	}

	/**
	 * Returns an iterable of key-value pairs in the map.
	 * @returns {IterableIterator<[K, V]>} An iterable of key-value pairs in the map.
	 */
	public entries(): IterableIterator<[K, V]> {
		const entries: Array<[K, V]> = [];
		for (const store of this._store) {
			// eslint-disable-next-line unicorn/no-array-for-each
			store.forEach((value, key) => entries.push([key, value]));
		}

		return entries[Symbol.iterator]();
	}

	/**
	 * Returns an iterable of keys in the map.
	 * @returns {IterableIterator<K>} An iterable of keys in the map.
	 */
	public keys(): IterableIterator<K> {
		const keys: K[] = [];
		for (const store of this._store) {
			// eslint-disable-next-line unicorn/no-array-for-each
			store.forEach((_, key) => keys.push(key));
		}

		return keys[Symbol.iterator]();
	}

	/**
	 * Returns an iterable of values in the map.
	 * @returns {IterableIterator<V>} An iterable of values in the map.
	 */
	public values(): IterableIterator<V> {
		const values: V[] = [];
		for (const store of this._store) {
			// eslint-disable-next-line unicorn/no-array-for-each
			store.forEach(value => values.push(value));
		}

		return values[Symbol.iterator]();
	}

	/**
	 * Returns an iterator that iterates over the key-value pairs in the map.
	 * @returns {IterableIterator<[K, V]>} An iterator that iterates over the key-value pairs in the map.
	 */
	public [Symbol.iterator](): IterableIterator<[K, V]> {
		const entries: Array<[K, V]> = [];
		for (const store of this._store) {
			// eslint-disable-next-line unicorn/no-array-for-each
			store.forEach((value, key) => entries.push([key, value]));
		}

		return entries[Symbol.iterator]();
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
		const store = this.getStore(key);
		const deleted = store.delete(key);

		return deleted;
	}

	/**
	 * Calls a provided callback function once for each key-value pair in the map.
	 * @param {function} callbackfn - The function to execute for each key-value pair.
	 * @param {any} [thisArg] - An optional value to use as `this` when executing the callback.
	 */
	public forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
		// eslint-disable-next-line unicorn/no-array-for-each
		this._store.forEach(store => {
			// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
			store.forEach(callbackfn, thisArg);
		});
		// Note: NEED TO FIX THIS
	}

	/**
	 * Gets the value associated with the specified key.
	 * @param {K} key - The key of the entry to get.
	 * @returns {V | undefined} The value associated with the key, or undefined if the key does not exist.
	 */
	public get(key: K): V | undefined {
		const store = this.getStore(key);
		return store.get(key);
	}

	/**
	 * Checks if the map contains a key.
	 * @param {K} key - The key to check for existence.
	 * @returns {boolean} Returns true if the key exists, false otherwise.
	 */
	public has(key: K): boolean {
		const store = this.getStore(key);
		return store.has(key);
	}

	/**
	 * Sets the value for a key in the map.
	 * @param {K} key - The key of the entry to set.
	 * @param {V} value - The value to set for the entry.
	 * @returns {Map<K, V>} The map instance.
	 */
	public set(key: K, value: V): Map<K, V> {
		const store = this.getStore(key);

		store.set(key, value);
		return store;
	}

	/**
	 * Gets the number of entries in the map.
	 * @returns {number} The number of entries in the map.
	 */
	public get size(): number {
		let size = 0;
		for (const store of this._store) {
			size += store.size;
		}

		return size;
	}
}
