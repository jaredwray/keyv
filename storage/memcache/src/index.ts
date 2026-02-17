import EventEmitter from "node:events";
import { defaultDeserialize } from "@keyv/serialize";
import type { KeyvStoreAdapter, StoredData } from "keyv";
import { Memcache, type MemcacheOptions } from "memcache";

/**
 * Configuration options for the KeyvMemcache adapter.
 * Extends the Memcache client options with additional Keyv-specific properties.
 */
export type KeyvMemcacheOptions = {
	/** The URL of the memcache server */
	url?: string;
	/** Default expiration time in seconds */
	expires?: number;
} & Partial<MemcacheOptions> &
	// biome-ignore lint/suspicious/noExplicitAny: type format
	Record<string, any>;

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
export class KeyvMemcache extends EventEmitter implements KeyvStoreAdapter {
	/** Optional namespace used to prefix all keys */
	public namespace?: string;
	/** The underlying Memcache client instance */
	public client: Memcache;
	/** Merged configuration options */
	public opts: KeyvMemcacheOptions;

	/**
	 * Creates a new KeyvMemcache instance.
	 * @param uri - The memcache server URI (e.g., `'localhost:11211'`) or an options object. Defaults to `'localhost:11211'`.
	 * @param options - Additional configuration options, merged with the first argument if it is an object.
	 */
	constructor(
		uri?: string | KeyvMemcacheOptions,
		options?: KeyvMemcacheOptions,
	) {
		super();

		const allOptions: KeyvMemcacheOptions = {
			...(typeof uri === "object" ? uri : { uri }),
			...options,
		};

		if (allOptions.uri && !allOptions.url) {
			allOptions.url = allOptions.uri;
		}

		const connectionUri = allOptions.url || "localhost:11211";
		allOptions.url = allOptions.uri = connectionUri;

		this.opts = allOptions;

		const { url, uri: _uri, expires, ...memcacheOptions } = allOptions;
		this.client = new Memcache({ nodes: [connectionUri], ...memcacheOptions });
	}

	/**
	 * Returns the formatted namespace string.
	 * @returns The namespace in the format `'namespace:{namespace}'`
	 */
	_getNamespace(): string {
		// biome-ignore lint/style/noNonNullAssertion: fix this
		return `namespace:${this.namespace!}`;
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
				return {
					value: undefined,
					expires: 0,
				};
			}

			return this.opts.deserialize
				? this.opts.deserialize(value)
				: defaultDeserialize(value);
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
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

		try {
			await this.client.set(this.formatKey(key), value as string, exptime);
		} catch (error) {
			this.emit("error", error);
			throw error;
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
		const results = await Promise.allSettled(promises);
		for (const result of results) {
			if (result.status === "rejected") {
				this.emit("error", result.reason);
				throw result.reason as Error;
			}
		}
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
			throw error;
		}
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
	 * Clears all data from the memcache server by flushing it.
	 * Note: this flushes the entire server, not just the current namespace.
	 */
	async clear(): Promise<void> {
		try {
			await this.client.flush();
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
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
	 * Gracefully disconnects from the memcache server.
	 */
	async disconnect(): Promise<void> {
		await this.client.disconnect();
	}
}

export default KeyvMemcache;
