import { Hookified } from "hookified";
import {
	Keyv,
	type KeyvAny,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import { EtcdClient, type Lease } from "./client.js";
import type { ClearOutput, DeleteOutput, GetOutput, HasOutput } from "./types.js";

/**
 * Configuration options for the KeyvEtcd adapter.
 */
export type KeyvEtcdOptions = {
	/** The etcd server URL (e.g., `'127.0.0.1:2379'`). The `etcd://` protocol prefix is automatically stripped. */
	url?: string;
	/** Alias for `url` */
	uri?: string;
	/** Default TTL in milliseconds for all keys. Converted to seconds internally for etcd leases. */
	ttl?: number;
	/** Per-request timeout in milliseconds. Aborts hung requests via `AbortSignal.timeout`. */
	busyTimeout?: number;
	/** Optional namespace for key prefixing */
	namespace?: string;
};

/**
 * Etcd storage adapter for Keyv.
 * Talks to etcd over its built-in HTTP/JSON gateway with no third-party client dependency.
 *
 * @example
 * ```typescript
 * const store = new KeyvEtcd('etcd://localhost:2379');
 * const keyv = new Keyv({ store });
 * ```
 */
export class KeyvEtcd<GenericValue = KeyvAny> extends Hookified {
	/** Declares the v6 absolute-`expires` storage contract via `capabilities.expires`. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	private _client!: EtcdClient;
	private _lease?: Lease;
	private _url = "127.0.0.1:2379";
	private _ttl?: number;
	private _busyTimeout?: number;
	private _namespace?: string;
	private _keyPrefixSeparator = ":";

	/**
	 * Creates a new KeyvEtcd instance.
	 * @param url - An etcd server URI string (e.g., `'etcd://localhost:2379'`) or a `KeyvEtcdOptions` object. Defaults to `'127.0.0.1:2379'`.
	 * @param options - Optional `KeyvEtcdOptions` object. When both `url` and `options` are objects, they are merged together.
	 */
	constructor(url?: KeyvEtcdOptions | string, options?: KeyvEtcdOptions) {
		super({ throwOnEmptyListeners: false });

		url ??= {};

		if (typeof url === "string") {
			url = { url };
		}

		if (url.uri) {
			url = { url: url.uri, ...url };
		}

		const merged = {
			...url,
			...options,
		};

		/* v8 ignore next -- @preserve */
		if (merged.url) {
			this._url = merged.url.replace(/^etcd:\/\//, "");
		}

		this._ttl = typeof merged.ttl === "number" ? merged.ttl : undefined;
		this._busyTimeout = merged.busyTimeout;

		this._client = new EtcdClient({
			url: this._url,
			timeout: this._busyTimeout,
		});

		this._client.status().catch((error) => this.emit("error", error));

		if (typeof this._ttl === "number") {
			this._lease = this._client.lease(this._ttl / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	/**
	 * Gets the underlying etcd client instance.
	 */
	public get client(): EtcdClient {
		return this._client;
	}

	/**
	 * Sets the underlying etcd client instance.
	 */
	public set client(value: EtcdClient) {
		this._client = value;
	}

	/**
	 * Gets the etcd lease used for TTL support.
	 */
	public get lease(): Lease | undefined {
		return this._lease;
	}

	/**
	 * Sets the etcd lease used for TTL support.
	 */
	public set lease(value: Lease | undefined) {
		this._lease = value;
	}

	/**
	 * Gets the etcd server URL.
	 * @default '127.0.0.1:2379'
	 */
	public get url(): string {
		return this._url;
	}

	/**
	 * Sets the etcd server URL.
	 */
	public set url(value: string) {
		this._url = value;
	}

	/**
	 * Gets the default TTL in milliseconds.
	 * @default undefined
	 */
	public get ttl(): number | undefined {
		return this._ttl;
	}

	/**
	 * Sets the default TTL in milliseconds.
	 */
	public set ttl(value: number | undefined) {
		this._ttl = value;
	}

	/**
	 * Gets the per-request timeout in milliseconds.
	 * @default undefined
	 */
	public get busyTimeout(): number | undefined {
		return this._busyTimeout;
	}

	/**
	 * Sets the busy timeout in milliseconds. The new value applies to subsequent
	 * requests via the underlying client.
	 */
	public set busyTimeout(value: number | undefined) {
		this._busyTimeout = value;
		this._client.timeout = value;
	}

	/**
	 * Gets the namespace used to prefix keys.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace used to prefix keys.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets the separator between the namespace and key.
	 * @default ':'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Sets the separator between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Creates a prefixed key by prepending the namespace and separator.
	 * @param key - The key to prefix
	 * @param namespace - The namespace to prepend. If not provided, the key is returned as-is.
	 * @returns The prefixed key (e.g., `'namespace:key'`), or the original key if no namespace is given.
	 */
	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Removes the namespace prefix from a key.
	 * @param key - The key to strip the prefix from
	 * @param namespace - The namespace prefix to remove. If not provided, the key is returned as-is.
	 * @returns The key without the namespace prefix.
	 */
	public removeKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, "");
		}

		return key;
	}

	/**
	 * Formats a key by prepending the namespace if one is set. Avoids double-prefixing
	 * by checking if the key already starts with the namespace prefix.
	 * @param key - The key to format
	 * @returns The formatted key with namespace prefix, or the original key if no namespace is set.
	 */
	public formatKey(key: string): string {
		if (!this._namespace) {
			return key;
		}

		const prefix = `${this._namespace}${this._keyPrefixSeparator}`;
		if (key.startsWith(prefix)) {
			return key;
		}

		return `${prefix}${key}`;
	}

	/**
	 * Retrieves a value from the etcd server.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist.
	 */
	public async get(key: string): GetOutput<GenericValue> {
		try {
			const raw = await this._client.get(this.formatKey(key));
			if (raw === null) {
				return undefined;
			}

			// etcd leases are second-granular (and revoked lazily), so do a precise
			// client-side expiry check from the stored `expires` metadata as well.
			const { value, expired } = this.unwrapValue<GenericValue>(raw);
			if (expired) {
				await this.delete(key);
				return undefined;
			}

			return value;
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Retrieves multiple values from the etcd server.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key.
	 */
	public async getMany(keys: string[]): Promise<Array<KeyvStorageGetResult<GenericValue>>> {
		const promises = keys.map(async (key) => this.get(key));
		const results = await Promise.allSettled(promises);
		const data: Array<KeyvStorageGetResult<GenericValue>> = [];
		for (const result of results) {
			/* v8 ignore next 2 -- @preserve get() swallows errors, so rejection is defensive */
			if (result.status === "rejected") {
				data.push(undefined);
			} else {
				data.push(result.value as KeyvStorageGetResult<GenericValue>);
			}
		}

		return data;
	}

	/**
	 * Stores a value in the etcd server. If an absolute `expires` is provided, the value is
	 * stored with an etcd lease computed from the remaining duration; otherwise the configured
	 * default TTL lease (if any) is used. etcd leases are second-granular, so the remaining
	 * duration is clamped to a minimum of one second.
	 * @param key - The key to store
	 * @param value - The value to store
	 * @param expires - Optional absolute expiry as Unix ms since epoch. `undefined` means no expiry.
	 * @returns `true` if the value was stored, `false` if the write failed.
	 */
	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		try {
			// etcd leases are second-granular, so round the duration UP. The lease is only a
			// server-side GC backstop (precise expiry is enforced client-side via the stored
			// `expires`); rounding up ensures the key is never reaped before its real deadline.
			const leaseSec =
				expires === undefined
					? typeof this._ttl === "number"
						? Math.ceil(this._ttl / 1000)
						: undefined
					: Math.max(Math.ceil((expires - Date.now()) / 1000), 1);

			const target =
				leaseSec === undefined
					? this._client
					: expires === undefined
						? this._lease
						: this._client.lease(leaseSec, { autoKeepAlive: false });

			await target?.put(this.formatKey(key)).value(this.wrapValue(value, expires));
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Wraps an (already-encoded) value with its absolute `expires` so reads can apply a precise,
	 * millisecond-accurate expiry check independent of etcd's coarser, lazily-revoked leases.
	 * The expiry comes from the `expires` parameter — the encoded value is never parsed.
	 * @param value - The encoded value to store.
	 * @param expires - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 * @returns A JSON envelope string `{ v, e }`.
	 */
	private wrapValue(value: unknown, expires?: number): string {
		return JSON.stringify({ v: value, e: typeof expires === "number" ? expires : null });
	}

	/**
	 * Unwraps a stored value, reporting whether it has expired. Values not written in the
	 * `{ v, e }` envelope (e.g. written directly to etcd) are returned as-is and never expired.
	 * @param raw - The raw value read back from etcd.
	 * @returns The unwrapped `value` and an `expired` flag.
	 */
	private unwrapValue<T>(raw: unknown): { value: T | undefined; expired: boolean } {
		/* v8 ignore next 3 -- @preserve */
		if (raw === null || raw === undefined) {
			return { value: undefined, expired: false };
		}

		try {
			const parsed = JSON.parse(raw as string) as { v: T; e: number | null };
			if (parsed.v === undefined) {
				// Not our envelope format — return as-is.
				return { value: raw as T, expired: false };
			}

			if (parsed.e !== null && Date.now() > parsed.e) {
				return { value: undefined, expired: true };
			}

			return { value: parsed.v, expired: false };
		} catch {
			// Not valid JSON — return as-is.
			return { value: raw as T, expired: false };
		}
	}

	/**
	 * Stores multiple values in the etcd server.
	 * @template Value - The type of the values being stored.
	 * @param entries - An array of `{ key, value, expires? }` entries, where `expires` is an absolute Unix ms timestamp.
	 * @returns An array of booleans, one per entry, indicating which writes succeeded.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		const promises = entries.map(async ({ key, value, expires }) => this.set(key, value, expires));
		const results = await Promise.allSettled(promises);
		const boolResults: boolean[] = [];
		for (const result of results) {
			/* v8 ignore next 3 -- @preserve */
			if (result.status === "rejected") {
				this.emit("error", result.reason);
				boolResults.push(false);
			} else {
				boolResults.push(true);
			}
		}

		return boolResults;
	}

	/**
	 * Deletes a key from the etcd server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise.
	 */
	public async delete(key: string): DeleteOutput {
		if (typeof key !== "string") {
			return false;
		}

		try {
			return await this._client
				.delete()
				.key(this.formatKey(key))
				.then((key) => key.deleted !== "0");
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Deletes multiple keys from the etcd server.
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was successfully deleted.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises).then((values) =>
			values.map((x) => (x.status === "fulfilled" ? x.value : false)),
		);
	}

	/**
	 * Clears data from the etcd server. If a namespace is set, only keys with
	 * the namespace prefix are deleted. Otherwise, all keys are deleted.
	 * @returns A promise that resolves once the matching keys have been deleted.
	 */
	public async clear(): ClearOutput {
		try {
			const promise = this._namespace
				? this._client.delete().prefix(`${this._namespace}${this._keyPrefixSeparator}`)
				: this._client.delete().all();
			return await promise.then(() => undefined);
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Returns an async iterator over key-value pairs. If a namespace is set,
	 * only keys matching the namespace prefix are yielded, and the namespace
	 * prefix is removed from the returned keys. The namespace does not need to
	 * be passed in — it uses the namespace configured on the adapter.
	 * @yields `[key, value]` pairs as an async generator.
	 */
	public async *iterator(): AsyncGenerator<[string, string], void, unknown> {
		const prefix = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}` : "";
		const iterator = await this._client.getAll().prefix(prefix).keys();

		for await (const key of iterator) {
			try {
				const raw = await this._client.get(key);
				/* v8 ignore next -- @preserve */
				if (raw === null) {
					continue;
				}

				const { value, expired } = this.unwrapValue<string>(raw);
				if (expired) {
					await this._client.delete().key(key);
					continue;
				}

				const unprefixedKey = this.removeKeyPrefix(key, this._namespace);
				yield [unprefixedKey, value as string];
				/* v8 ignore start -- @preserve */
			} catch (error) {
				this.emit("error", error);
			}
			/* v8 ignore stop -- @preserve */
		}
	}

	/**
	 * Checks whether a key exists in the etcd server.
	 * @param key - The key to check
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string): HasOutput {
		try {
			const raw = await this._client.get(this.formatKey(key));
			if (raw === null) {
				return false;
			}

			const { expired } = this.unwrapValue(raw);
			if (expired) {
				await this.delete(key);
				return false;
			}

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in the etcd server.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) => (result.status === "fulfilled" ? result.value : false));
	}

	/**
	 * Gracefully disconnects from the etcd server.
	 * @returns A promise that resolves once the client has been closed.
	 */
	public async disconnect() {
		try {
			this._client.close();
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
		}
		/* v8 ignore stop -- @preserve */
	}
}

/**
 * Creates a Keyv instance pre-configured with the KeyvEtcd storage adapter.
 * @param url - An etcd server URI string or a KeyvEtcdOptions object.
 * @param options - Optional KeyvEtcdOptions object.
 * @returns A Keyv instance using the KeyvEtcd adapter.
 *
 * @example
 * ```typescript
 * const keyv = createKeyv('etcd://localhost:2379');
 * await keyv.set('foo', 'bar');
 * ```
 */
export function createKeyv(url?: string | KeyvEtcdOptions, options?: KeyvEtcdOptions): Keyv {
	return new Keyv({ store: new KeyvEtcd(url, options) });
}

export default KeyvEtcd;
