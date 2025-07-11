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

export type BigMapOptions<K, V> = {
	hashFunction?: (key: K) => number;
} & HookifiedOptions;

export class BigMap<K, V> extends Hookified implements MapInterfacee<K, V> {
	private readonly map: Map<K, V>;

	/**
	 * Creates an instance of BigMap.
	 * @param {BigMapOptions<K, V>} [options] - Optional configuration options for the BigMap.
	 */
	constructor(options?: BigMapOptions<K, V>) {
		super(options);
		this.map = new Map<K, V>();
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
	}

	/**
	 * Deletes a key-value pair from the map.
	 * @param {K} key - The key of the entry to delete.
	 * @returns {boolean} Returns true if the entry was deleted, false if the key was not found.
	 */
	public delete(key: K): boolean {
		return this.map.delete(key);
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
		this.map.set(key, value);
		return this.map;
	}

	/**
	 * Gets the number of entries in the map.
	 * @returns {number} The number of entries in the map.
	 */
	public get size(): number {
		return this.map.size;
	}
}
