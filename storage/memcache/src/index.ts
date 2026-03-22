import { Hookified } from "hookified";
import type { KeyvStoreAdapter, StoredData } from "keyv";
import { Keyv } from "keyv";
import { Memcache, type MemcacheOptions } from "memcache";

/**
 * Configuration options for the KeyvMemcache adapter.
 * Extends the Memcache client options with additional Keyv-specific properties.
 */
export type KeyvMemcacheOptions = {
	/** Optional namespace for key prefixing */
	namespace?: string;
} & MemcacheOptions;

/**
 * Memcache storage adapter for Keyv.
 * Uses the `memcache` package to connect to a Memcached server.
 *
 * @example
 * ```typescript
 * const store = new KeyvMemcache('localhost:11211');
 * const keyv = new Keyv({ store });
 * ```
 */
export class KeyvMemcache extends Hookified implements KeyvStoreAdapter {
	/** Optional namespace used to prefix all keys */
	public namespace?: string;
	/** The underlying Memcache client instance */
	public client: Memcache;
	/** Merged configuration options */
	public opts: KeyvMemcacheOptions;
	private readonly _keys = new Set<string>();

	/**
	 * Creates a new KeyvMemcache instance.
	 * @param uri - The memcache server URI (e.g., `'localhost:11211'`) or an options object. Defaults to `'localhost:11211'`.
	 * @param options - Additional configuration options, merged with the first argument if it is an object.
	 */
	constructor(
		uri?: string | KeyvMemcacheOptions,
		options?: KeyvMemcacheOptions,
	) {
		super({ throwOnEmptyListeners: false });

		const allOptions: KeyvMemcacheOptions = {
			...(typeof uri === "object" ? uri : {}),
			...options,
		};

		if (!allOptions.nodes) {
			allOptions.nodes = typeof uri === "string" ? [uri] : ["localhost:11211"];
		}

		this.opts = allOptions;
		this.namespace = allOptions.namespace;

		const { namespace: _namespace, ...memcacheOptions } = allOptions;
		this.client = new Memcache(memcacheOptions);
	}

	/**
	 * Retrieves a value from the memcache server.
	 * @param key - The key to retrieve
	 * @returns The stored data, or `{ value: undefined, expires: 0 }` if the key does not exist
	 */
	async get<Value>(key: string): Promise<StoredData<Value>> {
		try {
			const value = await this.client.get(this.formatKey(key));
			if (value === undefined) {
				return undefined;
			}

			return value as StoredData<Value>;
		} catch (error) {
			this.emit("error", error);
		}

		return undefined;
	}

	/**
	 * Retrieves multiple values from the memcache server.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key
	 */
	async getMany<Value>(keys: string[]) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises).then((values) => {
			const data: Array<StoredData<Value>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				data.push(value.value as StoredData<Value>);
			}

			return data;
		});
	}

	/**
	 * Stores a value in the memcache server.
	 * @param key - The key to store
	 * @param value - The value to store
	 * @param ttl - Time to live in milliseconds. Converted to seconds internally for memcache.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number) {
		const exptime = ttl !== undefined ? Math.floor(ttl / 1000) : 0;
		const formattedKey = this.formatKey(key);

		try {
			await this.client.set(formattedKey, value as string, exptime);
			this._keys.add(formattedKey);
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Stores multiple values in the memcache server.
	 * @param entries - An array of objects containing key, value, and optional ttl
	 */
	async setMany(
		// biome-ignore lint/suspicious/noExplicitAny: type format
		entries: Array<{ key: string; value: any; ttl?: number }>,
	): Promise<void> {
		const promises = entries.map(async ({ key, value, ttl }) =>
			this.set(key, value, ttl),
		);
		await Promise.allSettled(promises);
	}

	/**
	 * Deletes a key from the memcache server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise
	 */
	async delete(key: string): Promise<boolean> {
		const formattedKey = this.formatKey(key);
		try {
			const result = await this.client.delete(formattedKey);
			this._keys.delete(formattedKey);
			return result;
		} catch (error) {
			this.emit("error", error);
		}

		return false;
	}

	/**
	 * Deletes multiple keys from the memcache server.
	 * @param keys - An array of keys to delete
	 * @returns `true` if all keys were successfully deleted, `false` otherwise
	 */
	async deleteMany(keys: string[]) {
		const promises = keys.map(async (key) => this.delete(key));
		const results = await Promise.allSettled(promises);
		// @ts-expect-error - x is an object
		return results.every((x) => x.value === true);
	}

	/**
	 * Checks whether a key exists in the memcache server.
	 * @param key - The key to check
	 * @returns `true` if the key exists, `false` otherwise. Returns `false` on any error.
	 */
	async has(key: string): Promise<boolean> {
		try {
			const value = await this.client.get(this.formatKey(key));
			return value !== undefined;
		} catch {
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in the memcache server.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) =>
			result.status === "fulfilled" ? result.value : false,
		);
	}

	/**
	 * Clears data from the memcache server.
	 * When a namespace is set, only keys within the namespace are deleted.
	 * When no namespace is set, flushes the entire server.
	 */
	async clear(): Promise<void> {
		try {
			if (this.namespace) {
				const promises = [];
				for (const key of this._keys) {
					promises.push(this.client.delete(key));
				}

				await Promise.allSettled(promises);
				this._keys.clear();
			} else {
				await this.client.flush();
				this._keys.clear();
			}
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Gracefully disconnects from the memcache server.
	 */
	async disconnect(): Promise<void> {
		await this.client.disconnect();
	}

	/**
	 * Formats a key by prepending the namespace if one is set.
	 * @param key - The key to format
	 * @returns The formatted key (e.g., `'namespace:key'`), or the original key if no namespace is set
	 */
	formatKey(key: string) {
		let result = key;

		if (this.namespace) {
			result = `${this.namespace.trim()}:${key.trim()}`;
		}

		return result;
	}
}

/**
 * Creates a new Keyv instance backed by a Memcache store.
 * @param uri - The memcache server URI (e.g., `'localhost:11211'`) or an options object.
 * @param options - Additional configuration options, merged with the first argument if it is an object.
 * @returns A configured Keyv instance using KeyvMemcache as the store.
 *
 * @example
 * ```typescript
 * const keyv = createKeyv('localhost:11211');
 * await keyv.set('foo', 'bar');
 * ```
 */
export const createKeyv = (
	uri?: string | KeyvMemcacheOptions,
	options?: KeyvMemcacheOptions,
) => new Keyv({ store: new KeyvMemcache(uri, options) });

export default KeyvMemcache;
