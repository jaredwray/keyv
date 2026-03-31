import { Hookified } from "hookified";
import type { KeyvEntry, KeyvStorageAdapter, KeyvRawResult } from "keyv";
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
	 * Wraps a value with expiry metadata for storage.
	 */
	private wrapValue(value: unknown, ttl?: number): string {
		const expires = typeof ttl === "number" ? Date.now() + ttl : null;
		return JSON.stringify({ v: value, e: expires });
	}

	/**
	 * Unwraps a stored value, checking expiry metadata.
	 * Handles legacy data (stored without envelope) gracefully.
	 */
	private unwrapValue<T>(raw: unknown): { value: T | undefined; expired: boolean } {
		/* v8 ignore next -- @preserve */
		if (raw === null || raw === undefined) {
			return { value: undefined, expired: false };
		}

		try {
			const parsed = JSON.parse(raw as string) as { v: T; e: number | null };
			if (parsed.v === undefined) {
				return { value: raw as T, expired: false };
			}

			if (parsed.e !== null && Date.now() > parsed.e) {
				return { value: undefined, expired: true };
			}

			return { value: parsed.v, expired: false };
		} catch {
			return { value: raw as T, expired: false };
		}
	}

	/**
	 * Retrieves a value from the memcache server.
	 * @param key - The key to retrieve
	 * @returns The stored data, or undefined if the key does not exist or is expired
	 */
	async get<Value>(key: string): Promise<KeyvRawResult<Value>> {
		try {
			const raw = await this.client.get(this.formatKey(key));
			if (raw === undefined) {
				return undefined;
			}

			const { value, expired } = this.unwrapValue<Value>(raw);
			if (expired) {
				await this.delete(key);
				return undefined;
			}

			return value as KeyvRawResult<Value>;
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
			const data: Array<KeyvRawResult<Value>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				data.push(value.value as KeyvRawResult<Value>);
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
		const exptime = ttl !== undefined ? Math.ceil(ttl / 1000) : 0;
		try {
			await this.client.set(this.formatKey(key), this.wrapValue(value, ttl), exptime);
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
			const raw = await this.client.get(this.formatKey(key));
			if (raw === undefined) {
				return false;
			}

			const { expired } = this.unwrapValue(raw);
			if (expired) {
				await this.delete(key);
				return false;
			}

			return true;
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
