import { Etcd3, type Lease } from "etcd3";
import { Hookified } from "hookified";
import { Keyv, type StoredData } from "keyv";
import type {
	ClearOutput,
	DeleteManyOutput,
	DeleteOutput,
	GetOutput,
	HasOutput,
	SetOutput,
} from "./types.js";

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
	/** Busy timeout in milliseconds */
	busyTimeout?: number;
	/** Storage dialect identifier, always `'etcd'` */
	dialect?: "etcd";
	/** Optional namespace for key prefixing */
	namespace?: string;
};

/**
 * Etcd storage adapter for Keyv.
 * Uses the [etcd3](https://github.com/microsoft/etcd3) client to connect to an etcd server.
 *
 * @example
 * ```typescript
 * const store = new KeyvEtcd('etcd://localhost:2379');
 * const keyv = new Keyv({ store });
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: any is allowed
export class KeyvEtcd<Value = any> extends Hookified {
	private _client!: Etcd3;
	private _lease?: Lease;
	private _url = "127.0.0.1:2379";
	private _ttl?: number;
	private _busyTimeout?: number;
	private _dialect = "etcd";
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

		/* c8 ignore next -- @preserve */
		if (merged.url) {
			this._url = merged.url.replace(/^etcd:\/\//, "");
		}

		this._ttl = typeof merged.ttl === "number" ? merged.ttl : undefined;
		this._busyTimeout = merged.busyTimeout;

		this._client = new Etcd3({
			hosts: this._url,
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this._client.getRoles().catch((error) => this.emit("error", error));

		if (typeof this._ttl === "number") {
			this._lease = this._client.lease(this._ttl / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	/**
	 * Gets the merged configuration options. Read-only for legacy compatibility.
	 * @returns The current options including url, ttl, busyTimeout, dialect, and namespace.
	 */
	get opts(): KeyvEtcdOptions {
		return {
			url: this._url,
			ttl: this._ttl,
			busyTimeout: this._busyTimeout,
			dialect: this._dialect as "etcd",
			namespace: this._namespace,
		};
	}

	/**
	 * Gets the underlying etcd3 client instance.
	 */
	get client(): Etcd3 {
		return this._client;
	}

	/**
	 * Sets the underlying etcd3 client instance.
	 */
	set client(value: Etcd3) {
		this._client = value;
	}

	/**
	 * Gets the etcd lease used for TTL support.
	 */
	get lease(): Lease | undefined {
		return this._lease;
	}

	/**
	 * Sets the etcd lease used for TTL support.
	 */
	set lease(value: Lease | undefined) {
		this._lease = value;
	}

	/**
	 * Gets the etcd server URL.
	 * @default '127.0.0.1:2379'
	 */
	get url(): string {
		return this._url;
	}

	/**
	 * Sets the etcd server URL.
	 */
	set url(value: string) {
		this._url = value;
	}

	/**
	 * Gets the default TTL in milliseconds.
	 * @default undefined
	 */
	get ttl(): number | undefined {
		return this._ttl;
	}

	/**
	 * Sets the default TTL in milliseconds.
	 */
	set ttl(value: number | undefined) {
		this._ttl = value;
	}

	/**
	 * Gets the busy timeout in milliseconds.
	 * @default undefined
	 */
	get busyTimeout(): number | undefined {
		return this._busyTimeout;
	}

	/**
	 * Sets the busy timeout in milliseconds.
	 */
	set busyTimeout(value: number | undefined) {
		this._busyTimeout = value;
	}

	/**
	 * Gets the storage dialect identifier. Always returns `'etcd'`.
	 */
	get dialect(): string {
		return this._dialect;
	}

	/**
	 * Gets the namespace used to prefix keys.
	 * @default undefined
	 */
	get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace used to prefix keys.
	 */
	set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets the separator between the namespace and key.
	 * @default ':'
	 */
	get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Sets the separator between the namespace and key.
	 */
	set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Creates a prefixed key by prepending the namespace and separator.
	 * @param key - The key to prefix
	 * @param namespace - The namespace to prepend. If not provided, the key is returned as-is.
	 * @returns The prefixed key (e.g., `'namespace:key'`), or the original key if no namespace is given.
	 */
	createKeyPrefix(key: string, namespace?: string): string {
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
	removeKeyPrefix(key: string, namespace?: string): string {
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
	formatKey(key: string): string {
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
	async get(key: string): GetOutput<Value> {
		return this._client.get(this.formatKey(key)) as unknown as GetOutput<Value>;
	}

	/**
	 * Retrieves multiple values from the etcd server.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored data corresponding to each key.
	 */
	async getMany(keys: string[]): Promise<Array<StoredData<Value>>> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises).then((values) => {
			const data: Array<StoredData<Value>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				if (value.value === null) {
					data.push(undefined);
				} else {
					// @ts-expect-error - value is an object
					data.push(value.value as StoredData<Value>);
				}
			}

			return data;
		});
	}

	/**
	 * Stores a value in the etcd server. If a default TTL is configured, the value is stored with an etcd lease.
	 * @param key - The key to store
	 * @param value - The value to store
	 */
	async set(key: string, value: Value): SetOutput {
		const target = this._ttl ? this._lease : this._client;

		// @ts-expect-error - Value needs to be number, string or buffer
		await target?.put(this.formatKey(key)).value(value);
	}

	/**
	 * Stores multiple values in the etcd server.
	 * @param entries - An array of objects containing key and value
	 */
	async setMany(entries: Array<{ key: string; value: Value }>): Promise<void> {
		const promises = entries.map(async ({ key, value }) =>
			this.set(key, value),
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
	 * Deletes a key from the etcd server.
	 * @param key - The key to delete
	 * @returns `true` if the key was deleted, `false` otherwise.
	 */
	async delete(key: string): DeleteOutput {
		if (typeof key !== "string") {
			return false;
		}

		return this._client
			.delete()
			.key(this.formatKey(key))
			.then((key) => key.deleted !== "0");
	}

	/**
	 * Deletes multiple keys from the etcd server.
	 * @param keys - An array of keys to delete
	 * @returns `true` if all keys were successfully deleted, `false` otherwise.
	 */
	async deleteMany(keys: string[]): DeleteManyOutput {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises).then((values) =>
			// @ts-expect-error - x is an object
			values.every((x) => x.value === true),
		);
	}

	/**
	 * Clears data from the etcd server. If a namespace is set, only keys with
	 * the namespace prefix are deleted. Otherwise, all keys are deleted.
	 */
	async clear(): ClearOutput {
		const promise = this._namespace
			? this._client
					.delete()
					.prefix(`${this._namespace}${this._keyPrefixSeparator}`)
			: this._client.delete().all();
		return promise.then(() => undefined);
	}

	/**
	 * Returns an async iterator over key-value pairs. If a namespace is provided,
	 * only keys matching the namespace prefix are yielded.
	 * @param namespace - Optional namespace to filter keys by
	 */
	async *iterator(namespace?: string) {
		const prefix = namespace ? `${namespace}${this._keyPrefixSeparator}` : "";
		const iterator = await this._client.getAll().prefix(prefix).keys();

		for await (const key of iterator) {
			const value = (await this._client.get(key)) as unknown as Value;
			yield [key, value];
		}
	}

	/**
	 * Checks whether a key exists in the etcd server.
	 * @param key - The key to check
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	async has(key: string): HasOutput {
		return this._client.get(this.formatKey(key)).exists();
	}

	/**
	 * Checks whether multiple keys exist in the etcd server.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		const promises = keys.map(async (key) => this.has(key));
		const results = await Promise.allSettled(promises);
		return results.map((result) =>
			result.status === "fulfilled" ? result.value : false,
		);
	}

	/**
	 * Gracefully disconnects from the etcd server.
	 */
	async disconnect() {
		this._client.close();
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
export function createKeyv(
	url?: string | KeyvEtcdOptions,
	options?: KeyvEtcdOptions,
): Keyv {
	return new Keyv({ store: new KeyvEtcd(url, options) });
}

export default KeyvEtcd;
