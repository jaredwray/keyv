import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { Hookified } from "hookified";
import type { KeyvStorageAdapter, KeyvStorageEntry, KeyvStorageGetResult } from "keyv";
import { Keyv, keyvStorageCapability } from "keyv";
import { Memcache, type MemcacheNode, type MemcacheOptions } from "memcache";

/** Characters memcached doesn't allow in a key: whitespace and control characters. */
const INVALID_KEY_CHARACTERS = /[\s\p{Cc}]/u;

/**
 * Prefix of the keys that hold a digest instead of the key itself. A key that already starts with
 * it is hashed too, so it can't land on the digest of another key.
 */
const HASHED_KEY_PREFIX = "keyv:sha256:";

/**
 * Prefix of the keys that hold a namespace's generation token. A key that starts with it is hashed
 * too, so no data key can overwrite a generation.
 */
const GENERATION_KEY_PREFIX = "keyv:gen:";

/** Prefixes reserved for the adapter's own keys. A data key that starts with one is hashed. */
const RESERVED_KEY_PREFIXES = [HASHED_KEY_PREFIX, GENERATION_KEY_PREFIX];

/** The fewest hex characters of the digest a hashed key keeps, 128 bits, when `maxKeySize` is low. */
const MIN_DIGEST_LENGTH = 32;

/** Random bytes in a generation token. The token is stored as hex, twice as many characters. */
const GENERATION_TOKEN_BYTES = 8;

/** A value to write, with its formatted key and memcached `exptime`. */
type Write = { key: string; value: string; exptime: number };

/**
 * Converts an absolute expiry into a memcached `exptime`: 0 never expires, and values over 30 days
 * (2,592,000 seconds) are read as an absolute Unix timestamp in seconds, smaller ones as seconds
 * from now.
 * @param expires - Absolute expiry as Unix ms, or `undefined` for none.
 * @returns The `exptime` to send.
 */
function toExptime(expires: number | undefined): number {
	if (expires === undefined) {
		return 0;
	}

	const remaining = expires - Date.now();
	return remaining > 2_592_000_000
		? Math.ceil(expires / 1000)
		: Math.max(1, Math.ceil(remaining / 1000));
}

/**
 * Creates a random generation token.
 * @returns 16 lowercase hex characters.
 */
function createGenerationToken(): string {
	return randomBytes(GENERATION_TOKEN_BYTES).toString("hex");
}

/**
 * Configuration options for the KeyvMemcache adapter.
 * Extends the Memcache client options with additional Keyv-specific properties.
 */
export type KeyvMemcacheOptions = {
	/** Optional namespace used to prefix all keys. */
	namespace?: string;
	/**
	 * The separator between the namespace and the key.
	 * @default "::"
	 */
	namespaceSeparator?: string;
	/**
	 * Without a namespace, whether `clear()` flushes the whole memcached server, removing other
	 * namespaces' entries and keys other clients wrote. By default it only removes the entries this
	 * adapter wrote without a namespace. When `true` and no namespace is set, values are also stored
	 * as given, without a generation token. A store with a namespace always clears only that
	 * namespace.
	 * @default false
	 */
	noNamespaceAffectsAll?: boolean;
} & MemcacheOptions;

/**
 * Memcache storage adapter for Keyv.
 * Uses the `memcache` package to connect to a Memcached server.
 *
 * memcached can't list or delete keys by prefix, so `clear()` works by generation: each namespace
 * has a random token in memcached, every value is stored after the token it was written under, and
 * `clear()` writes a new token. Values under an old token read as missing, and memcached evicts
 * them or lets them expire.
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
	private _noNamespaceAffectsAll: boolean;
	private _namespaceSeparator = "::";
	/** The last generation token read or written for each namespace, keyed by namespace. */
	private readonly _generations = new Map<string, string>();

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
		if (allOptions.namespaceSeparator !== undefined) {
			this._namespaceSeparator = allOptions.namespaceSeparator;
		}

		this._noNamespaceAffectsAll = allOptions.noNamespaceAffectsAll ?? false;

		const {
			namespace: _namespace,
			namespaceSeparator: _namespaceSeparator,
			noNamespaceAffectsAll: _noNamespaceAffectsAll,
			...memcacheOptions
		} = allOptions;
		// The memcache client rejects any exptime above `maxExpiration` (default 30 days). Since
		// `set` converts a far-future absolute `expires` into a memcached absolute Unix-timestamp
		// exptime (the >30-day rule), raise the ceiling to the 32-bit wire maximum (~year 2106) so
		// those writes are permitted instead of throwing. A user-supplied value still wins.
		this.client = new Memcache({ maxExpiration: 4_294_967_295, ...memcacheOptions });

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
	 * Gets the separator between the namespace and the key.
	 * @default '::'
	 * @returns The namespace/key separator.
	 */
	public get namespaceSeparator(): string {
		return this._namespaceSeparator;
	}

	/**
	 * Sets the separator between the namespace and the key.
	 * @param value - The separator to place between the namespace and the key.
	 */
	public set namespaceSeparator(value: string) {
		this._namespaceSeparator = value;
	}

	/**
	 * Gets whether `clear()` flushes the whole server when no namespace is set.
	 * @returns `true` when a store without a namespace flushes the server and stores values as given.
	 */
	public get noNamespaceAffectsAll(): boolean {
		return this._noNamespaceAffectsAll;
	}

	/**
	 * Sets whether `clear()` flushes the whole server when no namespace is set.
	 * @param value - `true` to flush the server and store values as given when no namespace is set.
	 */
	public set noNamespaceAffectsAll(value: boolean) {
		this._noNamespaceAffectsAll = value;
	}

	/**
	 * The key that holds the current namespace's generation token: `keyv:gen:` and a SHA-256 digest
	 * of the namespace, shortened to fit `maxKeySize` like other hashed keys. `clear()` writes a new
	 * token there.
	 * @returns The generation key for the current namespace.
	 */
	public get generationKey(): string {
		return this.digestKey(GENERATION_KEY_PREFIX, this.namespace ?? "");
	}

	/**
	 * Retrieves a value from the memcache server.
	 * @template Value - The expected type of the stored value.
	 * @param key - The key to retrieve
	 * @returns The stored value, or `undefined` if the key does not exist, has expired, or was
	 * cleared.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		// Expiry is enforced server-side by the exptime set on write. memcached's exptime is
		// second-granular, so a value may be returned up to ~1s past a sub-second/just-elapsed
		// deadline; Keyv's `checkExpired` (on by default) re-filters for millisecond-precise expiry.
		const [value] = await this.getMany<Value>([key]);
		return value as KeyvStorageGetResult<Value>;
	}

	/**
	 * Retrieves multiple values from the memcache server in one multi-get.
	 * @template Value - The expected type of the stored values.
	 * @param keys - An array of keys to retrieve
	 * @returns An array of stored values in the same order as `keys`, with `undefined` for
	 * keys that are missing, expired, or cleared.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		try {
			return (await this.readValues(keys)) as Array<KeyvStorageGetResult<Value | undefined>>;
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => undefined);
		}
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
		const [stored] = await this.setMany([{ key, value, expires }]);
		return stored;
	}

	/**
	 * Stores multiple values in the memcache server.
	 * @template Value - The type of the values being stored.
	 * @param entries - An array of entries, each with a key, value, and optional absolute `expires` in Unix ms.
	 * @returns An array of booleans, one per entry, indicating which writes succeeded.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[]> {
		const writes = entries.map(({ key, value, expires }) => ({
			key: this.formatKey(key),
			value: value as string,
			exptime: toExptime(expires),
		}));
		try {
			return await this.writeValues(writes);
		} catch (error) {
			this.emit("error", error);
			return writes.map(() => false);
		}
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
	 * @returns `true` if the key exists and has not expired or been cleared, `false` otherwise.
	 * Returns `false` on an error, which is emitted.
	 */
	public async has(key: string): Promise<boolean> {
		// Existence is determined server-side via the exptime set on write, which is
		// second-granular (see get() for the sub-second caveat).
		const [exists] = await this.hasMany([key]);
		return exists;
	}

	/**
	 * Checks whether multiple keys exist in the memcache server, in one multi-get.
	 * @param keys - An array of keys to check
	 * @returns An array of booleans indicating whether each key exists.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		try {
			return (await this.readValues(keys)).map((value) => value !== undefined);
		} catch (error) {
			this.emit("error", error);
			return keys.map(() => false);
		}
	}

	/**
	 * Removes the entries this adapter wrote under the current namespace by writing a new
	 * generation token. Entries under the old token read as missing, and memcached evicts them or
	 * lets them expire. Other namespaces and keys other clients wrote are left alone. Without a
	 * namespace and with `noNamespaceAffectsAll`, it flushes the whole server instead.
	 * @returns A promise that resolves once the clear completes.
	 */
	public async clear(): Promise<void> {
		try {
			if (!this.usesGenerations) {
				// The client reports a flush a server rejected as `false` rather than throwing.
				if (!(await this.client.flush())) {
					this.emit("error", new Error("Memcache did not flush the server"));
				}

				return;
			}

			const token = createGenerationToken();
			if (await this.client.set(this.generationKey, token, 0)) {
				this._generations.set(this.namespace ?? "", token);
			} else {
				this.emit("error", new Error("Memcache did not store the new generation"));
			}
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
	 * Formats a key for memcached by prepending the namespace and {@link namespaceSeparator} if a
	 * namespace is set. memcached only takes a non-empty key of up to 250 bytes (the client's
	 * `maxKeySize`) with no whitespace or control characters, so any other key is stored under a
	 * SHA-256 digest of the namespaced key instead,
	 * `keyv:sha256:<hex>`. A key that starts with `keyv:sha256:` or `keyv:gen:` is hashed as well,
	 * so it can't overwrite the entry of the key it's the digest of or a generation token. When
	 * `maxKeySize` is below the 76 characters a digest key takes, the digest is shortened to fit,
	 * down to 128 bits. Other keys are returned unchanged.
	 * @param key - The key to format
	 * @returns The key memcached stores the value under (e.g., `'namespace::key'`).
	 */
	public formatKey(key: string): string {
		const formatted = this.namespace ? `${this.namespace}${this._namespaceSeparator}${key}` : key;
		if (
			formatted.length > 0 &&
			Buffer.byteLength(formatted) <= this.client.maxKeySize &&
			!INVALID_KEY_CHARACTERS.test(formatted) &&
			!RESERVED_KEY_PREFIXES.some((prefix) => formatted.startsWith(prefix))
		) {
			return formatted;
		}

		return this.digestKey(HASHED_KEY_PREFIX, formatted);
	}

	/**
	 * Whether values carry a generation token: always with a namespace, and without one unless
	 * `noNamespaceAffectsAll` is set.
	 * @returns `true` when reads, writes and `clear()` use the namespace's generation.
	 */
	private get usesGenerations(): boolean {
		return Boolean(this.namespace) || !this._noNamespaceAffectsAll;
	}

	/**
	 * Builds a key from a prefix and a SHA-256 digest of the input, shortening the digest to fit
	 * `maxKeySize`, down to 128 bits.
	 * @param prefix - The key prefix.
	 * @param input - The string to hash.
	 * @returns The prefixed digest key.
	 */
	private digestKey(prefix: string, input: string): string {
		const digest = createHash("sha256").update(input).digest("hex");
		const digestLength = Math.max(this.client.maxKeySize - prefix.length, MIN_DIGEST_LENGTH);
		return `${prefix}${digest.slice(0, digestLength)}`;
	}

	/**
	 * Reads values in one multi-get. With generations, the generation key is read in the same
	 * multi-get, and a value stored under another token reads as missing.
	 * @param keys - The keys to read.
	 * @returns The values, in the order of `keys`, with `undefined` for a missing one.
	 */
	private async readValues(keys: string[]): Promise<Array<string | undefined>> {
		if (keys.length === 0) {
			return [];
		}

		const formattedKeys = keys.map((key) => this.formatKey(key));
		if (!this.usesGenerations) {
			const values = await this.client.gets(formattedKeys);
			return formattedKeys.map((formattedKey) => values.get(formattedKey));
		}

		const generationKey = this.generationKey;
		const values = await this.client.gets([...formattedKeys, generationKey]);
		const prefix = `${await this.resolveGeneration(values.get(generationKey))}:`;
		return formattedKeys.map((formattedKey) => {
			const value = values.get(formattedKey);
			return value?.startsWith(prefix) ? value.slice(prefix.length) : undefined;
		});
	}

	/**
	 * Writes values. With generations, each value is stored after the current token,
	 * `<token>:<value>`, and the generation key is read alongside the writes. If it no longer holds
	 * that token, because another store cleared the namespace or the key was lost, the values that
	 * were stored are written again under the current token, so only a clear that runs at the same
	 * time as a write can hide it.
	 * @param writes - The formatted keys, values and exptimes to write.
	 * @returns Whether each value was stored, in the order of `writes`.
	 */
	private async writeValues(writes: Write[]): Promise<boolean[]> {
		if (!this.usesGenerations) {
			return this.storeValues(writes, "");
		}

		const generationKey = this.generationKey;
		const token =
			this._generations.get(this.namespace ?? "") ??
			(await this.resolveGeneration(await this.client.get(generationKey)));
		const [stored, observed] = await Promise.all([
			this.storeValues(writes, `${token}:`),
			this.client.get(generationKey),
		]);
		if (observed === token) {
			return stored;
		}

		const current = await this.resolveGeneration(observed);
		const rewrites = writes.filter((_write, index) => stored[index]);
		const restored = await this.storeValues(rewrites, `${current}:`);
		let rewritten = 0;
		return stored.map((wasStored) => wasStored && restored[rewritten++]);
	}

	/**
	 * Stores values in parallel, each after a prefix.
	 * @param writes - The formatted keys, values and exptimes to write.
	 * @param prefix - Text to store before each value: the generation token and `:`, or nothing.
	 * @returns Whether each value was stored, in the order of `writes`.
	 */
	private async storeValues(writes: Write[], prefix: string): Promise<boolean[]> {
		return Promise.all(
			writes.map(async ({ key, value, exptime }) => {
				try {
					// The client reports a write memcached rejected as `false` rather than throwing.
					const stored = await this.client.set(key, `${prefix}${value}`, exptime);
					if (!stored) {
						this.emit("error", new Error("Memcache did not store the value"));
					}

					return stored;
				} catch (error) {
					this.emit("error", error);
					return false;
				}
			}),
		);
	}

	/**
	 * Returns the current namespace's generation token, given what its generation key held, and
	 * remembers it for later writes. A missing token, whether never written, evicted, or lost with
	 * its node, is replaced with a new random one, so values under the old token read as missing
	 * rather than stale.
	 * @param observed - The generation key's value, or `undefined` when it wasn't found.
	 * @returns The current token.
	 * @throws {Error} If the generation key can't be read or created.
	 */
	private async resolveGeneration(observed: string | undefined): Promise<string> {
		const token = observed ?? (await this.createGeneration());
		this._generations.set(this.namespace ?? "", token);
		return token;
	}

	/**
	 * Writes a new random token to the generation key with `add`, which only stores it when the
	 * key is missing, so stores that race to create it agree on one.
	 * @returns The token the generation key now holds.
	 * @throws {Error} If the generation key can't be read or created.
	 */
	private async createGeneration(): Promise<string> {
		const generationKey = this.generationKey;
		const created = createGenerationToken();
		if (await this.client.add(generationKey, created, 0)) {
			return created;
		}

		// Another store created it first, or memcached can't be reached.
		const existing = await this.client.get(generationKey);
		if (existing === undefined) {
			throw new Error("Memcache could not read or create the generation key");
		}

		return existing;
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
