import { isUtf8 } from "node:buffer";
import {
	Batch,
	ClusterBatch,
	ClusterScanCursor,
	Decoder,
	GlideClient,
	type GlideClientConfiguration,
	GlideClusterClient,
	type GlideReturnType,
	type GlideString,
	TimeUnit,
} from "@valkey/valkey-glide";
import { Hookified } from "hookified";
import Keyv, {
	type KeyvAny,
	type KeyvStorageAdapter,
	type KeyvStorageCapability,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import type {
	KeyvValkeyGlideClient,
	KeyvValkeyGlideConnect,
	KeyvValkeyGlideOptions,
} from "./types.js";

const adapterOptionKeys = new Set(["uri", "cluster", "useSets", "namespace", "namespaceSeparator"]);

/**
 * Valkey GLIDE storage adapter for Keyv. Supports standalone and cluster clients
 * via `@valkey/valkey-glide`. Multi-key commands (`mget`, `unlink`, `mset`) are
 * cluster-aware in GLIDE, including AZ affinity when `readFrom` / `clientAz` are set.
 *
 * Client creation is async, so the constructor is lazy: the first storage call
 * (or {@link getClient}) establishes the connection.
 */
export class KeyvValkeyGlide extends Hookified implements KeyvStorageAdapter {
	private _namespace?: string;
	/**
	 * The separator between the namespace and the key in data keys, as in
	 * `namespace:<namespace>::<key>` or `sets:<namespace>::<key>`.
	 * @default "::"
	 */
	private _namespaceSeparator = "::";
	private _useSets = false;
	private _cluster = false;
	private _client?: KeyvValkeyGlideClient;
	private _closed = false;
	private _connectPromise?: Promise<KeyvValkeyGlideClient>;
	private readonly _glideConfig: GlideClientConfiguration;

	/**
	 * Creates a new KeyvValkeyGlide adapter.
	 *
	 * @param {KeyvValkeyGlideConnect} [connect] - URI, options, or an existing GLIDE client.
	 * @param {KeyvValkeyGlideOptions} [options] - Adapter options merged over `connect`.
	 */
	constructor(connect?: KeyvValkeyGlideConnect, options?: KeyvValkeyGlideOptions) {
		super({ throwOnEmptyListeners: false });

		if (isGlideClient(connect)) {
			this._client = connect;
			this._cluster = connect instanceof GlideClusterClient;
			this._glideConfig = { addresses: [] };
			if (options?.useSets !== undefined) {
				this._useSets = options.useSets;
			}

			if (options?.namespace !== undefined) {
				this._namespace = options.namespace;
			}

			if (options?.namespaceSeparator !== undefined) {
				this._namespaceSeparator = options.namespaceSeparator;
			}

			return;
		}

		const merged: KeyvValkeyGlideOptions = {
			...(typeof connect === "string" ? { uri: connect } : (connect ?? {})),
			...options,
		};

		if (merged.useSets !== undefined) {
			this._useSets = merged.useSets;
		}

		if (merged.namespace !== undefined) {
			this._namespace = merged.namespace;
		}

		if (merged.namespaceSeparator !== undefined) {
			this._namespaceSeparator = merged.namespaceSeparator;
		}

		this._cluster = merged.cluster === true;
		this._glideConfig = toGlideConfig(merged);
	}

	/**
	 * Declares the v6 absolute-`expires` storage contract via `capabilities.expires`.
	 * @returns {KeyvStorageCapability} The adapter capability descriptor, including `expires: true`.
	 */
	public get capabilities(): KeyvStorageCapability {
		return keyvStorageCapability(this);
	}

	/**
	 * Gets the namespace for the adapter. When set, all keys are prefixed with
	 * this namespace to provide multi-tenant isolation within a shared Valkey instance.
	 * @returns {string | undefined} The current namespace, or `undefined` if no namespace is set.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace for the adapter. Used for key prefixing and scoping
	 * operations like `clear()`, `iterator()`, and set-based key tracking.
	 * @param {string | undefined} value - The namespace string to use, or `undefined` to remove namespacing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets the separator between the namespace and the key in data keys.
	 * @returns {string} The namespace/key separator.
	 * @default "::"
	 */
	public get namespaceSeparator(): string {
		return this._namespaceSeparator;
	}

	/**
	 * Sets the separator between the namespace and the key in data keys.
	 * @param {string} value - The separator to place between the namespace and the key.
	 */
	public set namespaceSeparator(value: string) {
		this._namespaceSeparator = value;
	}

	/**
	 * Gets whether Valkey sets are used for key management. When enabled, keys are tracked
	 * in a Valkey set per namespace, allowing `clear()` to remove only the keys belonging to
	 * that namespace without scanning.
	 * @returns {boolean} `true` if set-based key tracking is enabled, `false` otherwise.
	 * @default false
	 */
	public get useSets(): boolean {
		return this._useSets;
	}

	/**
	 * Sets whether Valkey sets are used for key management.
	 * @param {boolean} value - `true` to enable set-based key tracking, `false` to use pattern scanning.
	 */
	public set useSets(value: boolean) {
		this._useSets = value;
	}

	/**
	 * Gets the underlying GLIDE client, for operations the adapter doesn't expose. The adapter
	 * connects lazily, so there is no client until the first storage call or {@link getClient}
	 * opens one, unless a client was passed to the constructor.
	 * @returns {KeyvValkeyGlideClient} The connected `GlideClient` or `GlideClusterClient`.
	 * @throws {Error} If no client has connected yet. Use {@link getClient} to connect first.
	 */
	public get client(): KeyvValkeyGlideClient {
		if (!this._client) {
			throw new Error("Valkey GLIDE client is not connected. Call getClient() first.");
		}

		return this._client;
	}

	/**
	 * Replaces the underlying GLIDE client and emits `connect` with it. The previous client is
	 * not closed. A connection still opening from the constructor config is closed when it
	 * finishes, and the assigned client is kept.
	 * @param {KeyvValkeyGlideClient} value - The `GlideClient` or `GlideClusterClient` to use.
	 */
	public set client(value: KeyvValkeyGlideClient) {
		this._connectPromise = undefined;
		this._closed = false;
		this._client = value;
		this._cluster = value instanceof GlideClusterClient;
		this.emit("connect", value);
	}

	/**
	 * Returns the connected GLIDE client, opening one from the constructor config on first use.
	 * Concurrent calls share one connection attempt.
	 * @returns {Promise<KeyvValkeyGlideClient>} The connected `GlideClient` or `GlideClusterClient`.
	 * @throws {Error} If the adapter was disconnected, or the connection fails.
	 */
	public async getClient(): Promise<KeyvValkeyGlideClient> {
		if (this._client) {
			return this._client;
		}

		if (this._closed) {
			throw new Error("Valkey GLIDE client is disconnected");
		}

		if (this._connectPromise) {
			return this._connectPromise;
		}

		const attempt = this.createClient().finally(() => {
			if (this._connectPromise === attempt) {
				this._connectPromise = undefined;
			}
		});
		this._connectPromise = attempt;
		return attempt;
	}

	/**
	 * Retrieves the value associated with a key from the Valkey store. The key is resolved through
	 * the namespace prefix before querying. The value is read as bytes, so a value that isn't valid
	 * UTF-8 comes back as a `Buffer` instead of failing the read.
	 * @template Value - The type of the stored value.
	 * @param {string} key - The key to look up.
	 * @returns {Promise<KeyvStorageGetResult<Value>>} The stored data if found, or `undefined` if the
	 *   key does not exist. Never returns `null`.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		const client = await this.getClient();
		const value = await client.get(this.getKeyName(key), { decoder: Decoder.Bytes });
		return fromStoredValue(value) as KeyvStorageGetResult<Value>;
	}

	/**
	 * Retrieves the values associated with multiple keys in a single `MGET`. GLIDE splits keys from
	 * different hash slots across the cluster itself.
	 * @template Value - The type of the stored values.
	 * @param {string[]} keys - An array of keys to look up.
	 * @returns {Promise<Array<KeyvStorageGetResult<Value | undefined>>>} An array of stored data in the
	 *   same order as the input keys. Each element is the stored value or `undefined` if the
	 *   corresponding key does not exist. Never `null`.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		if (keys.length === 0) {
			return [];
		}

		const client = await this.getClient();
		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		const values = await client.mget(resolvedKeys, { decoder: Decoder.Bytes });
		return values.map((value) => fromStoredValue(value)) as Array<
			KeyvStorageGetResult<Value | undefined>
		>;
	}

	/**
	 * Stores a key-value pair with an optional absolute expiry. If the value is `undefined`, the
	 * operation is skipped and returns `false`. When `useSets` is enabled, the key is also added to
	 * the namespace tracking set in the same transaction. In cluster mode, where the two sit in
	 * different hash slots, the key is added to the set before and after it is written instead.
	 * @param {string} key - The key under which to store the value.
	 * @param {KeyvAny} value - The value to store. A `Buffer` or `Uint8Array` is stored as raw bytes.
	 *   If `undefined`, the operation is a no-op.
	 * @param {number} [expires] - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 *   When provided, the key is set to expire at that timestamp via `PXAT`.
	 * @returns {Promise<boolean>} `true` if the value was stored, `false` if the value was `undefined`
	 *   or storing failed, in which case `error` is emitted.
	 */
	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		if (value === undefined) {
			return false;
		}

		try {
			const client = await this.getClient();
			const resolved = this.getKeyName(key);
			const glideValue = toGlideValue(value);
			const options = setOptions(expires);
			if (!this._useSets) {
				await client.set(resolved, glideValue, options);
			} else if (client instanceof GlideClusterClient) {
				// The key and the tracking set sit in different hash slots, which a cluster can't update
				// in one transaction. clear() only removes tracked keys, so the key is tracked before it
				// is written, in case a later command fails, and again after, in case a concurrent
				// clear() or delete() untracked it in between.
				const setKey = this.getSetKey();
				await client.sadd(setKey, [resolved]);
				await client.set(resolved, glideValue, options);
				await client.sadd(setKey, [resolved]);
			} else {
				await client.exec(
					new Batch(true).set(resolved, glideValue, options).sadd(this.getSetKey(), [resolved]),
					true,
				);
			}

			return true;
		} catch (error) {
			this.emit("error", error);
			return false;
		}
	}

	/**
	 * Stores multiple key-value pairs in one GLIDE batch. Entries with `undefined` values are skipped.
	 * When `useSets` is enabled, each key is also added to the namespace tracking set in the same
	 * transaction; in cluster mode, where the set sits in another hash slot, the keys are added to it
	 * before and after the writes instead.
	 * @template Value - The type of the stored values.
	 * @param {KeyvStorageEntry<Value>[]} entries - An array of `{ key, value, expires? }` entries where
	 *   `expires` is an optional absolute expiry as Unix ms since epoch.
	 * @returns {Promise<boolean[] | undefined>} An array of booleans in the same order as the input
	 *   entries. Each element is `true` if the corresponding entry was stored (entries with `undefined`
	 *   values are reported as `true`), or `false` if it failed, in which case `error` is emitted.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		// An entry with an undefined value is skipped and reported as stored, as in @keyv/valkey.
		const results = entries.map(({ value }) => value === undefined);
		const writes = entries.flatMap(({ key, value, expires }, index) =>
			value === undefined
				? []
				: [
						{
							index,
							key: this.getKeyName(key),
							value: toGlideValue(value),
							options: setOptions(expires),
						},
					],
		);
		if (writes.length === 0) {
			return results;
		}

		let client: KeyvValkeyGlideClient;
		try {
			client = await this.getClient();
		} catch (error) {
			this.emit("error", error);
			return results;
		}

		// A standalone server updates the tracking set in the same transaction as the writes. A
		// cluster can't, since the keys sit in other hash slots, so there the set is updated on its
		// own, before and after the writes; see set().
		const setKey = this._useSets ? this.getSetKey() : undefined;
		const clusterSetKey = client instanceof GlideClusterClient ? setKey : undefined;
		const batchSetKey = clusterSetKey === undefined ? setKey : undefined;
		const batch = batchSetKey ? new Batch(true) : this.createBatch(client);
		for (const write of writes) {
			batch.set(write.key, write.value, write.options);
			if (batchSetKey) {
				batch.sadd(batchSetKey, [write.key]);
			}
		}

		const writtenKeys = writes.map((write) => write.key);
		let batchResults: GlideReturnType[] | null;
		try {
			if (clusterSetKey) {
				await client.sadd(clusterSetKey, writtenKeys);
			}

			batchResults = await this.execBatch(client, batch, false);
			if (clusterSetKey) {
				await client.sadd(clusterSetKey, writtenKeys);
			}
		} catch (error) {
			this.emit("error", error);
			return results;
		}

		// A non-raising batch returns a failed command's error in its slot instead of rejecting.
		const commandError = batchResults?.find((result) => result instanceof Error);
		if (commandError) {
			this.emit("error", commandError);
		}

		// With useSets, an entry only counts as stored if its SADD worked too, since clear()
		// can't remove a key the tracking set doesn't list.
		const step = batchSetKey ? 2 : 1;
		for (const [position, write] of writes.entries()) {
			results[write.index] =
				batchResults?.[position * step] === "OK" &&
				!(batchSetKey && batchResults?.[position * step + 1] instanceof Error);
		}

		return results;
	}

	/**
	 * Deletes a single key with `UNLINK`. When `useSets` is enabled, the key is also removed from the
	 * namespace tracking set in the same transaction. In cluster mode, where the two sit in different
	 * hash slots, the key is removed from the set between two `UNLINK`s instead.
	 * @param {string} key - The key to delete.
	 * @returns {Promise<boolean>} `true` if the key existed and was deleted, `false` if it did not exist.
	 */
	public async delete(key: string): Promise<boolean> {
		const [deleted] = await this.deleteMany([key]);
		return deleted;
	}

	/**
	 * Deletes multiple keys in one GLIDE batch, with one `UNLINK` per key so each result says whether
	 * that key existed. Tracking-set updates follow {@link delete}.
	 * @param {string[]} keys - An array of keys to delete.
	 * @returns {Promise<boolean[]>} An array of booleans in the same order as the input keys. Each
	 *   element is `true` if the corresponding key existed and was deleted, `false` otherwise.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const client = await this.getClient();
		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		if (!this._useSets) {
			return this.unlinkEach(client, resolvedKeys);
		}

		const setKey = this.getSetKey();
		if (client instanceof GlideClusterClient) {
			// The keys and the tracking set sit in different hash slots; see set(). A key is
			// untracked only once it is gone, and unlinked again after, in case a concurrent set()
			// wrote it in between.
			const firstPass = await this.unlinkEach(client, resolvedKeys);
			await client.srem(setKey, resolvedKeys);
			const secondPass = await this.unlinkEach(client, resolvedKeys);
			return firstPass.map((deleted, index) => deleted || secondPass[index]);
		}

		// On a standalone server the keys and the tracking set change in one transaction.
		const batch = new Batch(true);
		for (const resolved of resolvedKeys) {
			batch.unlink([resolved]);
		}

		batch.srem(setKey, resolvedKeys);
		const results = await client.exec(batch, true);
		return resolvedKeys.map((_, index) => isPositive(results?.[index]));
	}

	/**
	 * Checks whether a key exists in the Valkey store.
	 * @param {string} key - The key to check for existence.
	 * @returns {Promise<boolean>} `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		const client = await this.getClient();
		const count = await client.exists([this.getKeyName(key)]);
		return count !== 0;
	}

	/**
	 * Checks whether multiple keys exist, with one `EXISTS` per key in a single GLIDE batch.
	 * @param {string[]} keys - An array of keys to check for existence.
	 * @returns {Promise<boolean[]>} An array of booleans in the same order as the input keys. Each
	 *   element is `true` if the corresponding key exists, `false` otherwise.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const client = await this.getClient();
		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		const batch = this.createBatch(client);
		for (const resolved of resolvedKeys) {
			batch.exists([resolved]);
		}

		const results = await this.execBatch(client, batch, true);
		return resolvedKeys.map((_, index) => isPositive(results?.[index]));
	}

	/**
	 * Removes all keys belonging to the current namespace. When `useSets` is enabled, the tracked keys
	 * are read from the namespace set and removed along with their entries in it. They are unlinked
	 * before and after they leave the set, so a key that a concurrent `set()` writes meanwhile is
	 * never left stored but untracked.
	 * When `useSets` is disabled, `SCAN` finds the keys matching {@link getKeyPattern}
	 * (`namespace:<namespace>::*`, glob metacharacters escaped) and unlinks them page by page. A
	 * namespace that merely shares a prefix (for example `users` vs `users-archive`) is never
	 * touched. One that extends this namespace with the separator (`users::archive`) is cleared too,
	 * because a pattern cannot tell it apart from a key that contains the separator. With no
	 * namespace this matches every key in the current database.
	 * The tracking set and the `SCAN` are read from primaries even when `readFrom` sends other reads
	 * to replicas, since a lagging replica could miss a key written just before. In cluster mode
	 * every primary is scanned.
	 * @returns {Promise<void>}
	 */
	public async clear(): Promise<void> {
		const client = await this.getClient();
		if (this._useSets) {
			const setKey = this.getSetKey();
			const keys = glideKeyPage(
				(await this.readFromPrimary(client, ["SMEMBERS", setKey], setKey)) as GlideString[],
			);
			if (keys.length > 0) {
				// Keys are untracked only once they are gone, and unlinked again after, in case a
				// concurrent set() wrote one in between.
				await client.unlink(keys);
				await client.srem(setKey, keys);
				await client.unlink(keys);
			}

			if (this.namespace) {
				const legacySetKey = `namespace:${this.namespace}`;
				const legacyKeyType = asString(
					(await this.readFromPrimary(client, ["TYPE", legacySetKey], legacySetKey)) as GlideString,
				);
				if (legacyKeyType === "set") {
					const legacyKeys = glideKeyPage(
						(await this.readFromPrimary(
							client,
							["SMEMBERS", legacySetKey],
							legacySetKey,
						)) as GlideString[],
					);
					if (legacyKeys.length > 0) {
						await Promise.all([client.unlink(legacyKeys), client.srem(legacySetKey, legacyKeys)]);
					}

					await client.unlink([legacySetKey]);
				}
			}

			return;
		}

		for await (const page of this.scanPrimaryPages(client, this.getKeyPattern())) {
			await client.unlink(page);
		}
	}

	/**
	 * Iterates over every key-value pair in the adapter's namespace, using `SCAN` with the pattern
	 * from {@link getKeyPattern} and one `MGET` per page. In cluster mode GLIDE's cluster scan covers
	 * every node. Reads follow `readFrom`, so with a replica strategy they can lag recent writes.
	 * @template Value - The type of the stored values.
	 * @returns {AsyncGenerator<[string, Value | undefined], void, unknown>} An async generator
	 *   yielding `[key, value]` tuples. The internal namespace prefix is stripped from each key, and
	 *   missing values are returned as `undefined` (never `null`).
	 */
	public async *iterator<Value>(): AsyncGenerator<[string, Value | undefined], void, unknown> {
		const client = await this.getClient();
		const keyPrefix = this.getKeyPrefix();
		const prefix = keyPrefix ? `${keyPrefix}${this._namespaceSeparator}` : "";
		for await (const page of this.scanPages(client, this.getKeyPattern())) {
			const values = await client.mget(page, { decoder: Decoder.Bytes });
			for (const [index, storedKey] of page.entries()) {
				const key = prefix ? storedKey.slice(prefix.length) : storedKey;
				const value = fromStoredValue(values[index]) as Value | undefined;
				yield [key, value];
			}
		}
	}

	/**
	 * Closes the GLIDE client and emits `disconnect`. Later calls reject until a client is assigned
	 * through the `client` setter, and a connection still opening is closed when it finishes.
	 * @returns {Promise<void>}
	 */
	public async disconnect(): Promise<void> {
		this._connectPromise = undefined;
		this._closed = true;
		if (!this._client) {
			return;
		}

		const client = this._client;
		client.close();
		this._client = undefined;
		this.emit("disconnect", client);
	}

	/**
	 * Opens a connection from the constructor config. A connect failure rejects without emitting
	 * `error`: the operation that asked for the client reports it, so it is reported once.
	 */
	private async createClient(): Promise<KeyvValkeyGlideClient> {
		const client = this._cluster
			? await GlideClusterClient.createClient(this._glideConfig)
			: await GlideClient.createClient(this._glideConfig);
		if (this._closed || this._client) {
			// disconnect() or the client setter ran while this connection was opening, so nothing
			// will use it. Close it instead of leaking it.
			client.close();
			if (this._client) {
				return this._client;
			}

			throw new Error("Valkey GLIDE client is disconnected");
		}

		this._client = client;
		this.emit("connect", client);
		return client;
	}

	/** Unlinks each key with its own command, so each result says whether that key existed. */
	private async unlinkEach(client: KeyvValkeyGlideClient, keys: string[]): Promise<boolean[]> {
		const batch = this.createBatch(client);
		for (const key of keys) {
			batch.unlink([key]);
		}

		const results = await this.execBatch(client, batch, true);
		return keys.map((_, index) => isPositive(results?.[index]));
	}

	private createBatch(client: KeyvValkeyGlideClient): Batch | ClusterBatch {
		return client instanceof GlideClusterClient ? new ClusterBatch(false) : new Batch(false);
	}

	/**
	 * Runs a batch. With `raiseOnError`, the first failed command rejects the call; without
	 * it, each failed command's error is returned in its slot of the results.
	 */
	private async execBatch(
		client: KeyvValkeyGlideClient,
		batch: Batch | ClusterBatch,
		raiseOnError: boolean,
	): Promise<GlideReturnType[] | null> {
		if (client instanceof GlideClusterClient) {
			return client.exec(batch as ClusterBatch, raiseOnError);
		}

		return client.exec(batch as Batch, raiseOnError);
	}

	private getSetKey(): string {
		if (this.namespace) {
			return `sets:${this.namespace}`;
		}

		return "sets";
	}

	private getKeyPrefix(): string {
		if (this._useSets) {
			if (this.namespace) {
				return `sets:${this.namespace}`;
			}

			return "sets";
		}

		if (this.namespace) {
			return `namespace:${this.namespace}`;
		}

		return "";
	}

	private getKeyName(key: string): string {
		const prefix = this.getKeyPrefix();
		if (prefix) {
			return `${prefix}${this._namespaceSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Builds the `SCAN MATCH` pattern that selects every data key in the current
	 * namespace. Glob metacharacters in the prefix and separator (`*`, `?`, `[`, `]`, `\`)
	 * are escaped so they are matched literally, and the separator is part of the
	 * pattern so a namespace that merely shares a prefix (for example `users` vs
	 * `users-archive`) is never selected. A namespace that extends this one with the
	 * separator (`users::archive`) cannot be told apart from a key containing the
	 * separator; `useSets: true` tracks keys per namespace instead. With no prefix this
	 * matches every key in the database.
	 */
	private getKeyPattern(): string {
		const prefix = this.getKeyPrefix();
		if (!prefix) {
			return "*";
		}

		const literal = `${prefix}${this._namespaceSeparator}`;
		return `${literal.replace(/[*?[\]\\]/g, "\\$&")}*`;
	}

	/**
	 * Runs a read command on the primary that owns `key`, even when `readFrom` sends reads to
	 * replicas. clear() deletes what these reads return, and a lagging replica could leave out
	 * a key written just before. A standalone client sends batches to the primary; a cluster
	 * client needs an explicit route.
	 */
	private async readFromPrimary(
		client: KeyvValkeyGlideClient,
		args: string[],
		key: string,
	): Promise<GlideReturnType> {
		if (client instanceof GlideClusterClient) {
			return client.customCommand(args, { route: { type: "primarySlotKey", key } });
		}

		return readFromStandalonePrimary(client, args);
	}

	/**
	 * Yields pages of keys matching `match`, scanning only primaries, for clear(). GLIDE's
	 * cluster scan and a standalone SCAN both follow `readFrom`, so with a replica strategy they
	 * could miss a key a replica hasn't received yet. A cluster is scanned one primary at a time.
	 */
	private async *scanPrimaryPages(
		client: KeyvValkeyGlideClient,
		match: string,
	): AsyncGenerator<string[], void, unknown> {
		const scanArgs = (cursor: string) => ["SCAN", cursor, "MATCH", match];
		if (client instanceof GlideClusterClient) {
			const firstPages = nodeResponses<[GlideString, GlideString[]]>(
				await client.customCommand(scanArgs("0"), { route: "allPrimaries" }),
			);
			for (const [address, firstPage] of firstPages) {
				const route = { type: "routeByAddress" as const, host: address };
				let [cursor, keys] = firstPage;
				while (true) {
					const page = glideKeyPage(keys);
					if (page.length > 0) {
						yield page;
					}

					if (asString(cursor) === "0") {
						break;
					}

					[cursor, keys] = (await client.customCommand(scanArgs(asString(cursor)), {
						route,
					})) as [GlideString, GlideString[]];
				}
			}

			return;
		}

		let cursor = "0";
		do {
			const [next, keys] = (await readFromStandalonePrimary(client, scanArgs(cursor))) as [
				GlideString,
				GlideString[],
			];
			cursor = asString(next);
			const page = glideKeyPage(keys);
			if (page.length > 0) {
				yield page;
			}
		} while (cursor !== "0");
	}

	private async *scanPages(
		client: KeyvValkeyGlideClient,
		match: string,
	): AsyncGenerator<string[], void, unknown> {
		if (client instanceof GlideClusterClient) {
			let cursor = new ClusterScanCursor();
			while (!cursor.isFinished()) {
				const [next, keys] = await client.scan(cursor, { match });
				cursor = next;
				const page = glideKeyPage(keys);
				if (page.length > 0) {
					yield page;
				}
			}

			return;
		}

		let cursor = "0";
		do {
			const [next, keys] = await client.scan(cursor, { match });
			cursor = String(next);
			const page = glideKeyPage(keys);
			if (page.length > 0) {
				yield page;
			}
		} while (cursor !== "0");
	}
}

/**
 * Creates a Keyv instance backed by {@link KeyvValkeyGlide}. The adapter's namespace, when set, is
 * passed to Keyv as well.
 * @param {KeyvValkeyGlideConnect} [connect] - A URI, an options object, or an existing GLIDE
 *   client. Defaults to `redis://localhost:6379`.
 * @param {KeyvValkeyGlideOptions} [options] - Adapter options merged over `connect`.
 * @returns {Keyv} A Keyv instance that stores data through the adapter.
 * @example
 * ```ts
 * const keyv = createKeyv('redis://localhost:6379', { namespace: 'my-app' });
 * await keyv.set('foo', 'bar');
 * ```
 */
export function createKeyv(
	connect?: KeyvValkeyGlideConnect,
	options?: KeyvValkeyGlideOptions,
): Keyv {
	connect ??= "redis://localhost:6379";
	const adapter = new KeyvValkeyGlide(connect, options);
	return new Keyv({ store: adapter, namespace: adapter.namespace });
}

export default KeyvValkeyGlide;
export type {
	KeyvValkeyGlideClient,
	KeyvValkeyGlideConnect,
	KeyvValkeyGlideOptions,
} from "./types.js";

function isGlideClient(value: unknown): value is KeyvValkeyGlideClient {
	return value instanceof GlideClient || value instanceof GlideClusterClient;
}

function toGlideConfig(options: KeyvValkeyGlideOptions): GlideClientConfiguration {
	const rest: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(options)) {
		if (!adapterOptionKeys.has(key) && value !== undefined) {
			rest[key] = value;
		}
	}

	const fromUri = options.uri ? parseConnectionUri(options.uri) : undefined;
	const addresses = (rest.addresses as GlideClientConfiguration["addresses"] | undefined) ??
		fromUri?.addresses ?? [{ host: "localhost", port: 6379 }];

	return {
		...fromUri,
		...rest,
		addresses,
		defaultDecoder: (rest.defaultDecoder as Decoder | undefined) ?? Decoder.String,
	} as GlideClientConfiguration;
}

function decodeUriComponentSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Parses `uri` into GLIDE connection fields. Only host, port, `useTLS`,
 * credentials, and the path-as-database-index are recognized; query
 * parameters are ignored — pass GLIDE fields (`readFrom`, `requestTimeout`, …)
 * as constructor options instead of via the URI.
 */
function parseConnectionUri(uri: string): Partial<GlideClientConfiguration> {
	const url = new URL(uri);
	const protocol = url.protocol.replace(":", "");
	const useTLS = protocol === "rediss" || protocol === "valkeys";
	const port = url.port ? Number(url.port) : 6379;
	const config: Partial<GlideClientConfiguration> = {
		// URL keeps the brackets around an IPv6 address; GLIDE wants the bare address.
		addresses: [{ host: url.hostname.replace(/^\[|\]$/g, "") || "localhost", port }],
		useTLS,
	};

	// Only authenticate when a password is present; a bare `user@host` URI
	// would otherwise send an empty-string password and fail auth.
	if (url.password) {
		const password = decodeUriComponentSafe(url.password);
		const username = url.username ? decodeUriComponentSafe(url.username) : undefined;
		config.credentials = username ? { username, password } : { password };
	}

	const database = url.pathname.replace(/^\//, "");
	if (database) {
		const databaseId = Number(database);
		if (Number.isFinite(databaseId)) {
			config.databaseId = databaseId;
		}
	}

	return config;
}

function setOptions(expires?: number) {
	if (typeof expires === "number") {
		return {
			expiry: { type: TimeUnit.UnixMilliseconds, count: Math.trunc(expires) },
		};
	}

	return undefined;
}

function toGlideValue(value: KeyvAny): GlideString {
	if (typeof value === "string") {
		return value;
	}

	if (value instanceof Uint8Array) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}

	return String(value);
}

function glideKeyPage(values: Iterable<GlideString>): string[] {
	const keys: string[] = [];
	for (const value of values) {
		const asKey = asString(value);
		if (asKey) {
			keys.push(asKey);
		}
	}

	return keys;
}

/**
 * Converts a key, cursor or reply to a string. GLIDE returns these as Buffers when the client's
 * `defaultDecoder` is `Decoder.Bytes`.
 */
function asString(value: GlideString): string {
	if (typeof value === "string") {
		return value;
	}

	return Buffer.from(value).toString();
}

/**
 * Converts a value read with `Decoder.Bytes` back to what was stored: a string when the bytes
 * are valid UTF-8, the Buffer otherwise. Reading as bytes means a binary value can't make a
 * read fail, and set() of a Buffer reads back as the same bytes.
 */
function fromStoredValue(value: GlideString | null | undefined): string | Buffer | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	// Values are read with Decoder.Bytes, so this is always a Buffer.
	const bytes = value as Buffer;
	return isUtf8(bytes) ? bytes.toString() : bytes;
}

/**
 * Lists a multi-node cluster reply as `[address, value]` pairs. GLIDE 2.5's `customCommand`
 * resolves to one `{ key: address, value }` record per node, while its declared type is an
 * object keyed by address, so both shapes are accepted.
 */
function nodeResponses<T>(response: unknown): Array<[string, T]> {
	if (Array.isArray(response)) {
		return response.map(({ key, value }: { key: GlideString; value: T }) => [asString(key), value]);
	}

	return Object.entries(response as Record<string, T>);
}

/** Whether a command's reply is a positive count, as from `EXISTS` or `UNLINK` of one key. */
function isPositive(result: GlideReturnType | undefined): boolean {
	return typeof result === "number" && result > 0;
}

/**
 * Runs a read on the primary of a standalone setup. A standalone client sends batches to the
 * primary even when `readFrom` sends single reads to replicas.
 */
async function readFromStandalonePrimary(
	client: GlideClient,
	args: string[],
): Promise<GlideReturnType> {
	// exec() returns null only for a transaction that WATCH aborted, and this batch is a pipeline.
	const results = (await client.exec(
		new Batch(false).customCommand(args),
		true,
	)) as GlideReturnType[];
	return results[0];
}
