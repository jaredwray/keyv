import { Hookified } from "hookified";
import {
	Keyv,
	type KeyvStorageAdapter,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import {
	type CloudflareKVMetadata,
	type CloudflareKVNamespace,
	type CloudflareKVPutOptions,
	CloudflareKVRestClient,
} from "./rest-client.js";

export type {
	CloudflareKVListOptions,
	CloudflareKVListResult,
	CloudflareKVMetadata,
	CloudflareKVNamespace,
	CloudflareKVPutOptions,
	CloudflareKVRestClientOptions,
	CloudflareKVValueWithMetadata,
} from "./rest-client.js";
export { CloudflareKVRestClient } from "./rest-client.js";

/**
 * Configuration for {@link KeyvCloudflareKV}. Provide **either** a `kvNamespace` binding (a native
 * Worker binding or a Miniflare-created namespace) **or** REST credentials (`accountId`,
 * `namespaceId`, `apiToken`).
 */
export type KeyvCloudflareKVOptions = {
	/**
	 * Which transport the adapter uses to talk to Cloudflare KV:
	 * - `"bind"` (default) — a native KV binding (a Worker `env.MY_KV` or a Miniflare namespace).
	 * - `"rest"` — the Cloudflare REST API, for use from any Node.js process.
	 *
	 * When omitted it is inferred from the options (a binding implies `"bind"`, REST credentials
	 * imply `"rest"`), defaulting to `"bind"`.
	 */
	mode?: KeyvCloudflareKVMode;
	/** Key prefix used to isolate entries belonging to this instance. */
	namespace?: string;
	/** Separator placed between the namespace and key. Defaults to `":"`. */
	keyPrefixSeparator?: string;
	/**
	 * A Cloudflare KV binding (the object exposed as `env.MY_KV` in a Worker, or the result of
	 * Miniflare's `getKVNamespace`). Used by `"bind"` mode.
	 */
	kvNamespace?: CloudflareKVNamespace;
	/** Cloudflare account ID. Required for `"rest"` mode. */
	accountId?: string;
	/** KV namespace ID (not the binding name). Required for `"rest"` mode. */
	namespaceId?: string;
	/** Cloudflare API token with Workers KV read/write permission. Required for `"rest"` mode. */
	apiToken?: string;
	/** Override the REST base URL. Defaults to `https://api.cloudflare.com/client/v4`. */
	url?: string;
};

/** Transport used by {@link KeyvCloudflareKV}: a native binding (`"bind"`) or the REST API (`"rest"`). */
export type KeyvCloudflareKVMode = "bind" | "rest";

/**
 * Type guard that detects whether a value satisfies the {@link CloudflareKVNamespace} shape
 * (native Worker binding or Miniflare namespace).
 * @param value - The value to test.
 * @returns `true` if the value exposes `get`/`put`/`delete`/`list` functions.
 */
function isKVNamespace(value: unknown): value is CloudflareKVNamespace {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as CloudflareKVNamespace).get === "function" &&
		typeof (value as CloudflareKVNamespace).put === "function" &&
		typeof (value as CloudflareKVNamespace).delete === "function" &&
		typeof (value as CloudflareKVNamespace).list === "function"
	);
}

/**
 * A Keyv storage adapter backed by [Cloudflare Workers KV](https://developers.cloudflare.com/kv/).
 *
 * Keyv handles value serialization, so the adapter stores the (already-serialized) value string in
 * KV as-is — no JSON wrapping in the adapter layer. The absolute expiry is kept in KV metadata and
 * enforced client-side on every read, giving millisecond-precise TTLs despite KV's 60-second native
 * minimum, while still handing KV a native `expirationTtl` for longer TTLs so it can reclaim space
 * on its own.
 */
export class KeyvCloudflareKV extends Hookified implements KeyvStorageAdapter {
	/** Declares the v6 absolute-`expires` storage contract via `capabilities.expires`. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	private _namespace?: string;
	private _keyPrefixSeparator = ":";
	private _client: CloudflareKVNamespace;
	private _mode: KeyvCloudflareKVMode;
	/** Cloudflare rejects native expirations less than 60s in the future. */
	private _minimumNativeExpirationSeconds = 60;
	/** Number of keys deleted concurrently per batch in `clear()`. */
	private _clearBatchSize = 100;

	/**
	 * Creates a new KeyvCloudflareKV adapter.
	 * @param options - A {@link KeyvCloudflareKVOptions} object, or a Cloudflare KV binding passed
	 * directly. When passing a binding directly, set `namespace` afterward via the property if needed.
	 */
	constructor(options: KeyvCloudflareKVOptions | CloudflareKVNamespace) {
		super({ throwOnEmptyListeners: false });

		// A binding passed directly is always "bind" mode.
		if (isKVNamespace(options)) {
			this._client = options;
			this._mode = "bind";
			return;
		}

		const opts = options ?? {};

		if (opts.namespace) {
			this._namespace = opts.namespace;
		}

		if (opts.keyPrefixSeparator !== undefined) {
			this._keyPrefixSeparator = opts.keyPrefixSeparator;
		}

		// Resolve the mode: honor an explicit choice, otherwise infer from what was supplied and
		// fall back to "bind".
		const hasBinding = isKVNamespace(opts.kvNamespace);
		const hasCredentials = Boolean(opts.accountId || opts.namespaceId || opts.apiToken);
		this._mode = opts.mode ?? (hasBinding ? "bind" : hasCredentials ? "rest" : "bind");

		if (this._mode === "rest") {
			this._client = new CloudflareKVRestClient({
				accountId: opts.accountId as string,
				namespaceId: opts.namespaceId as string,
				apiToken: opts.apiToken as string,
				url: opts.url,
			});
			return;
		}

		if (!hasBinding) {
			throw new Error(
				"KeyvCloudflareKV 'bind' mode requires a 'kvNamespace' binding. For a Node.js process without a binding, use mode: 'rest' with 'accountId', 'namespaceId', and 'apiToken'.",
			);
		}

		this._client = opts.kvNamespace as CloudflareKVNamespace;
	}

	/**
	 * Gets the underlying Cloudflare KV namespace (binding or REST client) used for all operations.
	 * @returns The {@link CloudflareKVNamespace} in use.
	 */
	public get client(): CloudflareKVNamespace {
		return this._client;
	}

	/**
	 * Sets the underlying Cloudflare KV namespace used for all operations.
	 * @param value - The {@link CloudflareKVNamespace} to use.
	 */
	public set client(value: CloudflareKVNamespace) {
		this._client = value;
	}

	/**
	 * Gets the transport mode in use: `"bind"` (native KV binding) or `"rest"` (REST API).
	 * @returns The resolved {@link KeyvCloudflareKVMode}.
	 */
	public get mode(): KeyvCloudflareKVMode {
		return this._mode;
	}

	/**
	 * Gets the namespace used to prefix keys.
	 * @returns The configured namespace, or `undefined` if none is set.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace used to prefix keys.
	 * @param value - The namespace to use, or `undefined` to clear it.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets the separator placed between the namespace and key.
	 * @default ':'
	 * @returns The namespace/key separator.
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Sets the separator placed between the namespace and key.
	 * @param value - The separator to place between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Gets the number of keys deleted concurrently per batch during {@link clear}.
	 * @default 100
	 * @returns The clear batch size.
	 */
	public get clearBatchSize(): number {
		return this._clearBatchSize;
	}

	/**
	 * Sets the number of keys deleted concurrently per batch during {@link clear}.
	 * @param value - The batch size (must be greater than 0).
	 */
	public set clearBatchSize(value: number) {
		this._clearBatchSize = value;
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
	 * Stores a value in Cloudflare KV. Keyv handles serialization, so the adapter writes the
	 * (already-serialized) value string directly. The absolute expiry is stored in KV metadata; for
	 * TTLs longer than 60 seconds a native KV `expirationTtl` is also set so KV reclaims the entry on
	 * its own, while shorter TTLs rely solely on the client-side expiry check.
	 * @param key - The key to store
	 * @param value - The value to store (a serialized string when used through Keyv)
	 * @param expires - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 * @returns `true` if the value was stored, `false` if the write failed.
	 */
	public async set(key: string, value: unknown, expires?: number): Promise<boolean> {
		try {
			const putOptions: CloudflareKVPutOptions = {};

			if (typeof expires === "number") {
				// Keep the precise deadline in metadata so reads can enforce it client-side.
				putOptions.metadata = { e: expires };

				// Cloudflare rejects native expirations under 60s in the future. Derive the TTL from
				// the raw millisecond delta with `Math.floor` and require it to be strictly greater
				// than the minimum, so the smallest value we ever send is 61s — a safety margin that
				// survives request latency and clock skew. We use the relative `expirationTtl` (which
				// KV evaluates against its own clock) rather than an absolute timestamp, so a slow
				// host clock can't push the deadline below the minimum. Client-side expiry still
				// enforces the exact deadline on read regardless.
				const ttlSeconds = Math.floor((expires - Date.now()) / 1000);
				if (ttlSeconds > this._minimumNativeExpirationSeconds) {
					putOptions.expirationTtl = ttlSeconds;
				}
			}

			await this._client.put(this.formatKey(key), this.toStoredValue(value), putOptions);
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Stores multiple values in Cloudflare KV.
	 * @template Value - The type of the values being stored.
	 * @param entries - An array of `{ key, value, expires? }` entries, where `expires` is an
	 * absolute Unix ms timestamp (or `undefined` for no expiry).
	 * @returns An array of booleans, one per entry, indicating which writes succeeded.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[]> {
		return Promise.all(entries.map(({ key, value, expires }) => this.set(key, value, expires)));
	}

	/**
	 * Retrieves a value from Cloudflare KV. Expired entries are treated as missing and deleted.
	 * @template Value - The expected type of the stored value.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist or has expired.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		const formatted = this.formatKey(key);
		try {
			const { value, metadata } = await this._client.getWithMetadata(formatted);
			if (value === null) {
				return undefined as KeyvStorageGetResult<Value>;
			}

			if (this.isExpired(metadata)) {
				// We already fetched the value, so delete directly to avoid a redundant read.
				await this._client.delete(formatted);
				return undefined as KeyvStorageGetResult<Value>;
			}

			return value as KeyvStorageGetResult<Value>;
		} catch (error) {
			this.emit("error", error);
			return undefined as KeyvStorageGetResult<Value>;
		}
	}

	/**
	 * Retrieves multiple values from Cloudflare KV.
	 * @template Value - The expected type of the stored values.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored values, with `undefined` for keys that are missing or expired.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		return Promise.all(keys.map((key) => this.get<Value>(key)));
	}

	/**
	 * Deletes a key from Cloudflare KV.
	 * @param key - The key to delete
	 * @returns `true` if the key existed and was deleted, `false` if it did not exist.
	 */
	public async delete(key: string): Promise<boolean> {
		try {
			const formatted = this.formatKey(key);
			const raw = await this._client.get(formatted);
			if (raw === null) {
				return false;
			}

			await this._client.delete(formatted);
			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Deletes multiple keys from Cloudflare KV.
	 * @param keys - An array of keys to delete
	 * @returns An array of booleans indicating whether each key was deleted.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		return Promise.all(keys.map((key) => this.delete(key)));
	}

	/**
	 * Checks whether a key exists (and has not expired) in Cloudflare KV.
	 * @param key - The key to check
	 * @returns `true` if the key exists and is not expired, `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		const formatted = this.formatKey(key);
		try {
			const { value, metadata } = await this._client.getWithMetadata(formatted);
			if (value === null) {
				return false;
			}

			if (this.isExpired(metadata)) {
				// We already fetched the value, so delete directly to avoid a redundant read.
				await this._client.delete(formatted);
				return false;
			}

			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Checks whether multiple keys exist in Cloudflare KV.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		return Promise.all(keys.map((key) => this.has(key)));
	}

	/**
	 * Clears entries from Cloudflare KV. If a namespace is set, only keys with the namespace prefix
	 * are deleted. Otherwise, all keys in the KV namespace are deleted.
	 * @returns A promise that resolves once the matching keys have been deleted.
	 */
	public async clear(): Promise<void> {
		try {
			const prefix = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}` : "";
			// Delete in bounded batches so we never buffer every key in memory or fire an
			// unbounded number of concurrent deletes (which can exhaust sockets or hit KV
			// rate limits for large namespaces).
			let batch: string[] = [];
			for await (const entry of this.listKeys(prefix)) {
				batch.push(entry.name);
				if (batch.length >= this._clearBatchSize) {
					await Promise.all(batch.map((name) => this._client.delete(name)));
					batch = [];
				}
			}

			if (batch.length > 0) {
				await Promise.all(batch.map((name) => this._client.delete(name)));
			}
		} catch (error) {
			this.emit("error", error);
		}
	}

	/**
	 * Iterates over all key-value pairs in the store matching the configured namespace. Keys are
	 * returned without the namespace prefix. Expired entries are skipped and deleted.
	 * @template Value - The expected type of the stored values.
	 * @yields `[key, value]` pairs as an async generator.
	 */
	public async *iterator<Value>(): AsyncGenerator<
		Array<string | Awaited<Value> | undefined>,
		void
	> {
		const prefix = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}` : "";

		for await (const entry of this.listKeys(prefix)) {
			// The listing already carries metadata, so expired keys are skipped without a read.
			/* v8 ignore next 4 -- @preserve native-expiry races are hard to hit deterministically */
			if (this.isExpired(entry.metadata ?? null)) {
				await this._client.delete(entry.name);
				continue;
			}

			const value = await this._client.get(entry.name);
			/* v8 ignore next 3 -- @preserve concurrent deletion race */
			if (value === null) {
				continue;
			}

			yield [this.removeKeyPrefix(entry.name, this._namespace), value as Awaited<Value>];
		}
	}

	/**
	 * Disconnects from Cloudflare KV. This is a no-op because the adapter communicates over HTTP
	 * (REST) or an in-process binding and holds no persistent connection.
	 * @returns A promise that resolves immediately.
	 */
	public async disconnect(): Promise<void> {
		// Cloudflare KV uses stateless HTTP requests / in-process bindings; nothing to close.
	}

	/**
	 * Lists every key matching a prefix, transparently following pagination cursors. Each yielded
	 * entry carries the key name and its metadata sidecar (when KV returns it in the listing).
	 * @param prefix - The key prefix to filter by (empty string lists everything).
	 * @yields Each matching key entry.
	 */
	private async *listKeys(
		prefix: string,
	): AsyncGenerator<{ name: string; metadata?: CloudflareKVMetadata | null }> {
		let cursor: string | undefined;

		do {
			const result = await this._client.list({ prefix: prefix || undefined, cursor });
			for (const entry of result.keys) {
				yield entry;
			}

			cursor = result.list_complete ? undefined : result.cursor;
		} while (cursor);
	}

	/**
	 * Coerces a value into the string KV stores. Values arrive already serialized when used through
	 * Keyv; a non-string passed to the adapter directly is coerced with `String`.
	 * @param value - The value to store.
	 * @returns The string to persist.
	 */
	private toStoredValue(value: unknown): string {
		return typeof value === "string" ? value : String(value);
	}

	/**
	 * Determines whether a metadata sidecar marks an entry as past its absolute expiry.
	 * @param metadata - The metadata read from KV (or `null` when none was stored).
	 * @param now - Reference timestamp in ms. Defaults to `Date.now()`.
	 * @returns `true` if the entry has expired, `false` otherwise.
	 */
	private isExpired(metadata: CloudflareKVMetadata | null, now: number = Date.now()): boolean {
		return typeof metadata?.e === "number" && metadata.e <= now;
	}
}

export default KeyvCloudflareKV;

/**
 * Creates a Keyv instance backed by the Cloudflare KV adapter.
 * @param options - {@link KeyvCloudflareKVOptions} or a Cloudflare KV binding.
 * @returns A Keyv instance using the Cloudflare KV adapter.
 */
export function createKeyv(options: KeyvCloudflareKVOptions | CloudflareKVNamespace): Keyv {
	const adapter = new KeyvCloudflareKV(options);

	if (!isKVNamespace(options) && options?.namespace) {
		adapter.namespace = options.namespace;
		return new Keyv(adapter, { namespace: options.namespace });
	}

	const keyv = new Keyv(adapter);
	keyv.namespace = undefined; // Ensure no namespace is set
	return keyv;
}

export { Keyv } from "keyv";
