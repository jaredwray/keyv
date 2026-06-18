import { Hookified } from "hookified";
import type { KeyvStorageAdapter, KeyvStorageEntry, KeyvStorageGetResult } from "keyv";
import { Keyv, keyvStorageCapability } from "keyv";
import { Memcache, type MemcacheNode, type MemcacheOptions } from "memcache";

/**
 * Configuration options for the KeyvMemcache adapter.
 * Extends the Memcache client options with additional Keyv-specific properties.
 */
export type KeyvMemcacheOptions = {
	/** Optional namespace used to prefix all keys. */
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
	/** Declares the v6 absolute-`expires` storage contract via `capabilities.expires`. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	/** Optional namespace used to prefix all keys. */
	public namespace?: string;
	/** The underlying Memcache client instance. */
	public client: Memcache;
	private readonly _nodes: (string | MemcacheNode)[];
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

		// Surface asynchronous client errors (connection drops, timeouts, retry exhaustion)
		// to listeners on the adapter. The client emits `(nodeId, error)`, so pick the Error,
		// wrapping any non-Error payload so listeners always receive a standard Error and
		// skipping empty notifications that carry nothing to report.
		this.client.on("error", (...arguments_: unknown[]) => {
			const rawError =
				arguments_.find((argument) => argument instanceof Error) ??
				arguments_[arguments_.length - 1];
			if (rawError) {
				const error = rawError instanceof Error ? rawError : new Error(String(rawError));
				this.emit("error", error);
			}
		});
	}

	/**
	 * Gets the configured memcache nodes.
	 * @returns The list of node URIs or `MemcacheNode` instances the client connects to.
	 */
	public get nodes(): (string | MemcacheNode)[] {
		return this._nodes;
	}

	/**
	 * Gets the configured socket timeout.
	 * @returns The timeout in milliseconds, or `undefined` when the client default is used.
	 */
	public get timeout(): number | undefined {
		return this._timeout;
	}

	/**
	 * Gets the configured keep-alive setting.
	 * @returns `true` or `false` when explicitly set, or `undefined` when the client default is used.
	 */
	public get keepAlive(): boolean | undefined {
		return this._keepAlive;
	}

	/**
	 * Gets the configured number of retries.
	 * @returns The retry count, or `undefined` when the client default is used.
	 */
	public get retries(): number | undefined {
		return this._retries;
	}

	/**
	 * Gets the configured delay between retries.
	 * @returns The retry delay in milliseconds, or `undefined` when the client default is used.
	 */
	public get retryDelay(): number | undefined {
		return this._retryDelay;
	}

	/**
	 * Retrieves a value from the memcache server.
	 * @template Value - The expected type of the stored value.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist or has expired.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		try {
			const raw = await this.client.get(this.formatKey(key));
			// Expiry is enforced server-side by the exptime set on write. memcached's exptime is
			// second-granular, so a value may be returned up to ~1s past a sub-second/just-elapsed
			// deadline; enable Keyv's `checkExpired` for millisecond-precise expiry. null/undefined
			// is a cache miss.
			return (raw ?? undefined) as KeyvStorageGetResult<Value>;
		} catch (error) {
			this.emit("error", error);
		}

		return undefined;
	}

	/**
	 * Retrieves multiple values from the memcache server.
	 * @template Value - The expected type of the stored values.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored values in the same order as `keys`, with `undefined` for
	 * keys that are missing or expired.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		const results = await Promise.allSettled(keys.map(async (key) => this.get<Value>(key)));
		return results.map((result) =>
			result.status === "fulfilled" ? result.value : undefined,
		) as Array<KeyvStorageGetResult<Value | undefined>>;
	}

	/**
	 * Stores a value in the memcache server.
	 * @param key - The key to store
	 * @param value - The value to store
	 * @param expires - Optional absolute expiry as Unix ms since epoch. Converted to the memcache
	 * `exptime` (seconds) internally; `undefined` means no expiry.
	 * @returns `true` if the value was stored, `false` if the write failed.
	 */
	public async set(key: string, value: unknown, expires?: number): Promise<boolean> {
		// memcache exptime: 0 = never expire. Values over 30 days (2,592,000s) are
		// interpreted as an absolute Unix timestamp in seconds; smaller values are a
		// relative duration in seconds. Compute from the absolute `expires` accordingly.
		const exptime =
			expires === undefined
				? 0
				: expires - Date.now() > 2_592_000_000
					? Math.ceil(expires / 1000)
					: Math.max(1, Math.ceil((expires - Date.now()) / 1000));
		try {
			await this.client.set(this.formatKey(key), value, exptime);
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Stores multiple values in the memcache server.
	 * @template Value - The type of the values being stored.
	 * @param entries - An array of entries, each with a key, value, and optional absolute `expires` in Unix ms.
	 * @returns An array of booleans, one per entry, indicating which writes succeeded.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		const settled = await Promise.allSettled(
			entries.map(async ({ key, value, expires }) => this.set(key, value, expires)),
		);
		return settled.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Deletes a key from the memcache server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise.
	 */
	public async delete(key: string): Promise<boolean> {
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
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.delete(key));
		const results = await Promise.allSettled(promises);
		return results.map((x) => (x.status === "fulfilled" ? x.value : false));
	}

	/**
	 * Checks whether a key exists in the memcache server.
	 * @param key - The key to check
	 * @returns `true` if the key exists and has not expired, `false` otherwise. Returns `false` on any error.
	 */
	public async has(key: string): Promise<boolean> {
		try {
			const raw = await this.client.get(this.formatKey(key));
			// Existence is determined server-side via the exptime set on write, which is
			// second-granular (see get() for the sub-second caveat).
			return raw !== undefined && raw !== null;
		} catch {
			/* v8 ignore next -- @preserve */
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in the memcache server.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Clears all data from the memcache server by flushing it.
	 * Note: memcached does not support key enumeration, so this always
	 * flushes the entire server regardless of namespace.
	 * @returns A promise that resolves once the flush completes.
	 */
	public async clear(): Promise<void> {
		try {
			await this.client.flush();
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Gracefully disconnects from the memcache server.
	 * @returns A promise that resolves once the client has disconnected.
	 */
	public async disconnect(): Promise<void> {
		await this.client.disconnect();
	}

	/**
	 * Formats a key by prepending the namespace if one is set.
	 * @param key - The key to format
	 * @returns The formatted key (e.g., `'namespace:key'`), or the original key if no namespace is set.
	 */
	public formatKey(key: string): string {
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
