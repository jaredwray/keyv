import { Hookified } from "hookified";
import type { KeyvEntry, KeyvStorageAdapter, StoredData } from "keyv";
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
export class KeyvMemcache extends Hookified implements KeyvStorageAdapter {
	/** Optional namespace used to prefix all keys */
	public namespace?: string;
	/** The underlying Memcache client instance */
	public client: Memcache;
	private readonly _nodes: (string | import("memcache").MemcacheNode)[];
	private readonly _timeout?: number;
	private readonly _keepAlive?: boolean;
	private readonly _retries?: number;
	private readonly _retryDelay?: number;

	/**
	 * Creates a new KeyvMemcache instance.
	 * @param uri - The memcache server URI (e.g., `'localhost:11211'`) or an options object. Defaults to `'localhost:11211'`.
	 * @param options - Additional configuration options, merged with the first argument if it is an object.
	 */
	constructor(uri?: string | KeyvMemcacheOptions, options?: KeyvMemcacheOptions) {
		super({ throwOnEmptyListeners: false });

		const allOptions: KeyvMemcacheOptions = {
			...(typeof uri === "object" ? uri : {}),
			...options,
		};

		if (!allOptions.nodes) {
			allOptions.nodes = typeof uri === "string" ? [uri] : ["localhost:11211"];
		}

		this._nodes = allOptions.nodes;
		this._timeout = allOptions.timeout;
		this._keepAlive = allOptions.keepAlive;
		this._retries = allOptions.retries;
		this._retryDelay = allOptions.retryDelay;
		this.namespace = allOptions.namespace;

		const { namespace: _namespace, ...memcacheOptions } = allOptions;
		this.client = new Memcache(memcacheOptions);
	}

	/**
	 * Gets the configured nodes.
	 */
	public get nodes(): (string | import("memcache").MemcacheNode)[] {
		return this._nodes;
	}

	/**
	 * Gets the configured timeout.
	 */
	public get timeout(): number | undefined {
		return this._timeout;
	}

	/**
	 * Gets the configured keepAlive setting.
	 */
	public get keepAlive(): boolean | undefined {
		return this._keepAlive;
	}

	/**
	 * Gets the configured retries.
	 */
	public get retries(): number | undefined {
		return this._retries;
	}

	/**
	 * Gets the configured retry delay.
	 */
	public get retryDelay(): number | undefined {
		return this._retryDelay;
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
	async set(key: string, value: any, ttl?: number): Promise<boolean> {
		const exptime = ttl !== undefined ? Math.floor(ttl / 1000) : 0;
		try {
			await this.client.set(this.formatKey(key), value as string, exptime);
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Stores multiple values in the memcache server.
	 * @param entries - An array of objects containing key, value, and optional ttl
	 */
	async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		const settled = await Promise.allSettled(
			entries.map(async ({ key, value, ttl }) => this.set(key, value, ttl)),
		);
		return settled.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Deletes a key from the memcache server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise
	 */
	async delete(key: string): Promise<boolean> {
		try {
			return await this.client.delete(this.formatKey(key));
		} catch (error) {
			this.emit("error", error);
		}

		return false;
	}

	/**
	 * Deletes multiple keys from the memcache server.
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was successfully deleted.
	 */
	async deleteMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.delete(key));
		const results = await Promise.allSettled(promises);
		return results.map((x) => (x.status === "fulfilled" ? x.value : false));
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
			/* v8 ignore next -- @preserve */
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
		return results.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Clears all data from the memcache server by flushing it.
	 * Note: memcached does not support key enumeration, so this always
	 * flushes the entire server regardless of namespace.
	 */
	async clear(): Promise<void> {
		try {
			await this.client.flush();
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
export const createKeyv = (uri?: string | KeyvMemcacheOptions, options?: KeyvMemcacheOptions) =>
	new Keyv({ store: new KeyvMemcache(uri, options) });

export default KeyvMemcache;
