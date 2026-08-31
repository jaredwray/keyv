import {
	createClient,
	createCluster,
	createSentinel,
	type RedisClientOptions,
	type RedisClientType,
	type RedisClusterOptions,
	type RedisClusterType,
	type RedisFunctions,
	type RedisModules,
	type RedisScripts,
	type RedisSentinelOptions,
	type RedisSentinelType,
	type RespVersions,
	type TypeMapping,
} from "@redis/client";
import calculateSlot from "cluster-key-slot";
import { Hookified } from "hookified";
import {
	type KeyvAny,
	type KeyvStorageAdapter,
	type KeyvStorageEntry,
	keyvStorageCapability,
} from "keyv";
import {
	defaultReconnectStrategy,
	type KeyvRedisConnect,
	type KeyvRedisEntry,
	type KeyvRedisOptions,
	type KeyvRedisPropertyOptions,
	type RedisClientConnectionType,
	type RedisConnectionClientType,
	type RedisConnectionClusterType,
	type RedisConnectionSentinelType,
	RedisErrorMessages,
} from "./types.js";

export {
	defaultReconnectStrategy,
	type KeyvRedisConnect,
	type KeyvRedisEntry,
	type KeyvRedisOptions,
	type KeyvRedisPropertyOptions,
	type RedisClientConnectionType,
	type RedisConnectionClientType,
	type RedisConnectionClusterType,
	type RedisConnectionSentinelType,
	RedisErrorMessages,
};

/**
 * Redis storage adapter for Keyv. Supports standalone, cluster, and sentinel
 * connections via `@redis/client`. Extends [Hookified](https://hookified.org) and
 * re-emits `error`, `connect`, `disconnect`, and `reconnecting` from the underlying
 * client. Implements {@link KeyvStorageAdapter} with namespacing, absolute `expires`
 * (`PXAT` / `PX` fallback), batch operations, and async iteration.
 *
 * @example
 * ```ts
 * import KeyvRedis from "@keyv/redis";
 * import Keyv from "keyv";
 *
 * const store = new KeyvRedis("redis://localhost:6379", { namespace: "cache" });
 * const keyv = new Keyv({ store });
 * store.on("error", (error) => console.error(error));
 * ```
 */
export default class KeyvRedis<T> extends Hookified implements KeyvStorageAdapter {
	/**
	 * The underlying Redis client, cluster, or sentinel connection used for all storage operations.
	 */
	private _client!: RedisClientConnectionType;
	/**
	 * Namespace used to prefix keys. When undefined, no namespace prefixing is applied.
	 * @default undefined
	 */
	private _namespace: string | undefined;
	/**
	 * Separator placed between the namespace and the key such as 'namespace::key'.
	 * @default "::"
	 */
	private _keyPrefixSeparator = "::";
	/**
	 * Number of keys to delete in a single batch when clearing.
	 * @default 1000
	 */
	private _clearBatchSize = 1000;
	/**
	 * Whether to use the UNLINK command instead of DEL when removing keys.
	 * @default true
	 */
	private _useUnlink = true;
	/**
	 * Whether operations with no namespace set affect all keys in the database.
	 * @default false
	 */
	private _noNamespaceAffectsAll = false;
	/**
	 * Whether to throw an error when the client fails to connect.
	 * @default true
	 */
	private _throwOnConnectError = true;
	/**
	 * Whether to throw an error when any operation fails instead of emitting an error event.
	 * @default false
	 */
	private _throwOnErrors = false;
	/**
	 * Connection timeout in milliseconds. When undefined, the Redis client default is used.
	 * @default undefined
	 */
	private _connectionTimeout: number | undefined;
	/**
	 * Whether the connected server supports the absolute-expiry `PXAT` option (Redis 6.2+).
	 * Detected lazily on first expiring write and cached. `undefined` until detected.
	 */
	private _pxatSupported?: boolean;
	/**
	 * Tracks the client instance whose events have already been wired up so that
	 * repeated initialization does not attach duplicate listeners.
	 */
	private _eventsWiredClient: RedisClientConnectionType | undefined;

	/**
	 * Stable `error` listener so it can be removed when the underlying client is replaced.
	 */
	private readonly _errorHandler = (error: Error) => {
		this.emit("error", error);
	};

	/**
	 * Stable `connect` listener so it can be removed when the underlying client is replaced.
	 */
	private readonly _connectHandler = () => {
		this.emit("connect", this._client);
	};

	/**
	 * Stable `disconnect` listener so it can be removed when the underlying client is replaced.
	 */
	private readonly _disconnectHandler = () => {
		this.emit("disconnect", this._client);
	};

	/**
	 * Stable `reconnecting` listener so it can be removed when the underlying client is replaced.
	 */
	private readonly _reconnectingHandler = (reconnectInfo: unknown) => {
		this.emit("reconnecting", reconnectInfo);
	};

	/**
	 * Creates a new KeyvRedis adapter.
	 *
	 * Accepts a Redis URI string, client/cluster/sentinel options, or an existing
	 * connection. When a URI string is provided, a client is created with
	 * {@link defaultReconnectStrategy}.
	 *
	 * @param {KeyvRedisConnect} [connect] - URI (`"redis://localhost:6379"`),
	 *   Redis client/cluster/sentinel options, or an existing connection. Defaults to
	 *   a localhost client with {@link defaultReconnectStrategy}.
	 * @param {KeyvRedisOptions} [options] - Adapter options such as `namespace`,
	 *   `keyPrefixSeparator`, `clearBatchSize`, `useUnlink`, `throwOnErrors`, and
	 *   `connectionTimeout`.
	 */
	constructor(connect?: KeyvRedisConnect, options?: KeyvRedisOptions) {
		super({ throwOnEmptyListeners: false });

		// Build the socket reconnect strategy
		const socket = {
			reconnectStrategy: defaultReconnectStrategy, // Default timeout for the connection
		};

		if (connect) {
			if (typeof connect === "string") {
				this._client = createClient({
					url: connect,
					socket,
				}) as RedisClientType;
			} else if ((connect as KeyvAny).connect !== undefined) {
				if (this.isClientSentinel(connect as RedisClientConnectionType)) {
					this._client = connect as RedisConnectionSentinelType;
				} else if (this.isClientCluster(connect as RedisClientConnectionType)) {
					this._client = connect as RedisConnectionClusterType;
				} else {
					this._client = connect as RedisClientType;
				}
			} else if (connect instanceof Object) {
				if ((connect as KeyvAny).sentinelRootNodes !== undefined) {
					this._client = createSentinel(connect as RedisSentinelOptions) as RedisSentinelType;
				} else if ((connect as KeyvAny).rootNodes === undefined) {
					this._client = createClient(connect as RedisClientOptions) as RedisClientType;
				} else {
					this._client = createCluster(connect as RedisClusterOptions);
				}
			}
		} else {
			// No connect provided, create the default client here instead of at class field initialization
			this._client = createClient({ socket }) as RedisConnectionClientType;
		}

		this.setOptions(options);
		this.initClient();
	}

	/**
	 * Declares the v6 absolute-`expires` storage contract via `capabilities.expires`.
	 * @returns {ReturnType<typeof keyvStorageCapability>} The adapter capability descriptor with `expires: true`.
	 */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	/**
	 * Get the Redis client, cluster, or sentinel connection.
	 * @returns {RedisClientConnectionType} The current Redis client, cluster, or sentinel connection.
	 */
	public get client(): RedisClientConnectionType {
		return this._client;
	}

	/**
	 * Set the Redis client, cluster, or sentinel connection. This will re-wire the event listeners
	 * and reset PXAT capability detection so the new server is introspected on the next expiring write.
	 * @param {RedisClientConnectionType} value - The Redis client connection to use.
	 */
	public set client(value: RedisClientConnectionType) {
		this._client = value;
		this._pxatSupported = undefined;
		this.initClient();
	}

	/**
	 * Get the namespace for the adapter. If undefined, it will not use a namespace including keyPrefixing.
	 * @returns {string | undefined} The current namespace, or undefined if no namespace is set.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. If undefined, it will not use a namespace including keyPrefixing.
	 * @param {string | undefined} value - The namespace to use, or undefined to disable namespacing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the separator between the namespace and key.
	 * @returns {string} The separator placed between the namespace and key.
	 * @default '::'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Set the separator between the namespace and key.
	 * @param {string} value - The separator to place between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Get the number of keys to delete in a single batch.
	 * @returns {number} The number of keys to delete in a single batch.
	 * @default 1000
	 */
	public get clearBatchSize(): number {
		return this._clearBatchSize;
	}

	/**
	 * Set the number of keys to delete in a single batch. Must be greater than 0 otherwise an error event is emitted.
	 * @param {number} value - The number of keys to delete in a single batch.
	 */
	public set clearBatchSize(value: number) {
		if (value > 0) {
			this._clearBatchSize = value;
		} else {
			this.emit("error", "clearBatchSize must be greater than 0");
		}
	}

	/**
	 * Get if Unlink is used instead of Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 * @returns {boolean} True if the UNLINK command is used instead of DEL.
	 * @default true
	 */
	public get useUnlink(): boolean {
		return this._useUnlink;
	}

	/**
	 * Set if Unlink is used instead of Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 * @param {boolean} value - True to use the UNLINK command instead of DEL.
	 */
	public set useUnlink(value: boolean) {
		this._useUnlink = value;
	}

	/**
	 * Get if no namespace affects all keys.
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * @returns {boolean} True if operations with no namespace affect all keys.
	 * @default false
	 */
	public get noNamespaceAffectsAll(): boolean {
		return this._noNamespaceAffectsAll;
	}

	/**
	 * Set if no namespace affects all keys.
	 * @param {boolean} value - True to allow operations with no namespace to affect all keys.
	 */
	public set noNamespaceAffectsAll(value: boolean) {
		this._noNamespaceAffectsAll = value;
	}

	/**
	 * Get if throwOnConnectError is set to true.
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the Redis server fails.
	 * @returns {boolean} True if an error is thrown when the client fails to connect.
	 * @default true
	 */
	public get throwOnConnectError(): boolean {
		return this._throwOnConnectError;
	}

	/**
	 * Set if throwOnConnectError is set to true.
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the Redis server fails.
	 * @param {boolean} value - True to throw an error when the client fails to connect.
	 */
	public set throwOnConnectError(value: boolean) {
		this._throwOnConnectError = value;
	}

	/**
	 * Get if throwOnErrors is set to true.
	 * This is used to throw an error if at any point there is a failure. Use this if you want to
	 * ensure that all operations are successful and you want to handle errors. By default, this is
	 * set to false so that it does not throw an error on every operation and instead emits an error event
	 * and returns no-op responses.
	 * @returns {boolean} True if an error is thrown when any operation fails.
	 * @default false
	 */
	public get throwOnErrors(): boolean {
		return this._throwOnErrors;
	}

	/**
	 * Set if throwOnErrors is set to true.
	 * This is used to throw an error if at any point there is a failure. Use this if you want to
	 * ensure that all operations are successful and you want to handle errors. By default, this is
	 * set to false so that it does not throw an error on every operation and instead emits an error event
	 * and returns no-op responses.
	 * @param {boolean} value - True to throw an error when any operation fails.
	 */
	public set throwOnErrors(value: boolean) {
		this._throwOnErrors = value;
	}

	/**
	 * Get the connection timeout in milliseconds such as 5000 (5 seconds). Default is undefined. If undefined, it will use the default.
	 * @returns {number | undefined} The connection timeout in milliseconds, or undefined to use the default.
	 * @default undefined
	 */
	public get connectionTimeout(): number | undefined {
		return this._connectionTimeout;
	}

	/**
	 * Set the connection timeout in milliseconds such as 5000 (5 seconds). Default is undefined. If undefined, it will use the default.
	 * @param {number | undefined} value - The connection timeout in milliseconds, or undefined to use the default.
	 * @default undefined
	 */
	public set connectionTimeout(value: number | undefined) {
		this._connectionTimeout = value;
	}

	/**
	 * Get the connected Redis client. Connects first if the client is not already
	 * connected, respecting `connectionTimeout`. On failure, emits `error` and, when
	 * `throwOnConnectError` is true, throws {@link RedisErrorMessages.RedisClientNotConnectedThrown}.
	 * @returns {Promise<RedisClientConnectionType>} The connected Redis client, cluster, or sentinel.
	 * @throws {Error} When connect fails and `throwOnConnectError` is true.
	 */
	public async getClient(): Promise<RedisClientConnectionType> {
		if (this._client.isOpen) {
			return this._client;
		}

		try {
			if (this._connectionTimeout === undefined) {
				await this._client.connect();
			} else {
				await this.raceWithTimeout(this._client.connect(), this._connectionTimeout);
			}
		} catch (error) {
			this.emit("error", error);

			await this.disconnect(true);

			if (this._throwOnConnectError) {
				throw new Error(RedisErrorMessages.RedisClientNotConnectedThrown);
			}
		}

		this.initClient();

		return this._client;
	}

	/**
	 * Set a key value pair in the store. Expiry is an absolute Unix timestamp in milliseconds.
	 * @param {string} key - The key to set.
	 * @param {string} value - The value to set.
	 * @param {number} [expires] - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 * @returns {Promise<boolean>} `true` if the value was set, `false` if an error occurred and `throwOnErrors` is false.
	 */
	public async set(key: string, value: string, expires?: number): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			if (typeof expires === "number") {
				await client.set(key, value, await this.buildExpiryOptions(client, expires));
			} else {
				await client.set(key, value);
			}

			return true;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			/* v8 ignore next -- @preserve */
			return false;
		}
	}

	/**
	 * Set many key-value pairs in a single `MULTI/EXEC` transaction (or one transaction
	 * per hash slot in cluster mode).
	 * @param {KeyvStorageEntry<Value>[]} entries - Entries with `key`, `value`, and optional absolute `expires`.
	 * @returns {Promise<boolean[]>} Per-entry success flags, or all `false` when an error is swallowed.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[]> {
		try {
			const results = new Array<boolean>(entries.length).fill(false);

			if (this.isCluster()) {
				// Ensure cluster is connected first
				await this.getClient();

				// Group entries by slot to avoid CROSSSLOT errors, tracking original indices
				const slotMap = new Map<number, Array<{ entry: KeyvStorageEntry<Value>; index: number }>>();
				for (let i = 0; i < entries.length; i++) {
					const entry = entries[i];
					const prefixedKey = this.createKeyPrefix(entry.key, this._namespace);
					const slot = calculateSlot(prefixedKey);
					const group = slotMap.get(slot) ?? [];
					group.push({ entry, index: i });
					slotMap.set(slot, group);
				}

				// Execute multi for each slot group
				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotEntries]) => {
						const client = await this.getSlotMaster(slot);
						const usePxat = await this.supportsPxat(client);
						const multi = client.multi();
						for (const {
							entry: { key, value, expires },
						} of slotEntries) {
							const prefixedKey = this.createKeyPrefix(key, this._namespace);
							if (typeof expires === "number") {
								multi.set(prefixedKey, value as string, this.expiryOptions(expires, usePxat));
							} else {
								multi.set(prefixedKey, value as string);
							}
						}
						const execResults = await multi.exec();
						for (let j = 0; j < slotEntries.length; j++) {
							results[slotEntries[j].index] = String(execResults[j]) === "OK";
						}
					}),
				);
			} else {
				// Non-cluster mode can use a single multi
				const client = (await this.getClient()) as RedisClientType;
				const usePxat = await this.supportsPxat(client);
				const multi = client.multi();
				for (const { key, value, expires } of entries) {
					const prefixedKey = this.createKeyPrefix(key, this._namespace);
					if (typeof expires === "number") {
						multi.set(prefixedKey, value as string, this.expiryOptions(expires, usePxat));
					} else {
						multi.set(prefixedKey, value as string);
					}
				}
				const execResults = await multi.exec();
				for (let i = 0; i < entries.length; i++) {
					results[i] = String(execResults[i]) === "OK";
				}
			}

			return results;
		} catch (error) {
			this.emit("error", error);
			if (this.shouldRethrow(error)) {
				throw error;
			}

			return entries.map(() => false);
		}
	}

	/**
	 * Check if a key exists in the store.
	 * @param {string} key - The key to check.
	 * @returns {Promise<boolean>} `true` if the key exists, `false` if it does not or an error was swallowed.
	 */
	public async has(key: string): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);
			const exists = await client.exists(key);

			return exists === 1;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return false; // Return false if an error occurs
		}
	}

	/**
	 * Check if many keys exist in the store in a single transaction (or per hash slot in cluster mode).
	 * @param {string[]} keys - The keys to check.
	 * @returns {Promise<boolean[]>} Per-key existence flags.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		try {
			const prefixedKeys = keys.map((key) => this.createKeyPrefix(key, this._namespace));

			if (this.isCluster()) {
				// Group keys by slot to avoid CROSSSLOT errors
				const slotMap = this.getSlotMap(prefixedKeys);
				const resultMap = new Map<string, boolean>();

				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotKeys]) => {
						const client = await this.getSlotMaster(slot);
						const multi = client.multi();
						for (const key of slotKeys) {
							multi.exists(key);
						}
						const results = await multi.exec();
						for (const [index, result] of results.entries()) {
							resultMap.set(slotKeys[index], typeof result === "number" && result === 1);
						}
					}),
				);

				/* v8 ignore next -- @preserve */
				return prefixedKeys.map((key) => resultMap.get(key) ?? false);
			} else {
				// Non-cluster mode can use a single multi
				const client = (await this.getClient()) as RedisClientType;
				const multi = client.multi();
				for (const key of prefixedKeys) {
					multi.exists(key);
				}

				const results = await multi.exec();
				return results.map((result) => typeof result === "number" && result === 1);
			}
		} catch (error) {
			this.emit("error", error);
			if (this.shouldRethrow(error)) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(false) as boolean[];
		}
	}

	/**
	 * Get a value from the store. Redis `null` replies are mapped to `undefined`.
	 * @param {string} key - The key to get.
	 * @returns {Promise<U | undefined>} The stored value, or `undefined` if the key does not exist or an error was swallowed.
	 */
	public async get<U = T>(key: string): Promise<U | undefined> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			const value = await client.get(key);
			return value === null ? undefined : (value as U);
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return undefined; // Return undefined if an error occurs
		}
	}

	/**
	 * Get many values from the store. Missing keys are `undefined`, never `null`.
	 * @param {string[]} keys - The keys to get.
	 * @returns {Promise<Array<U | undefined>>} Values in the same order as `keys`.
	 */
	public async getMany<U = T>(keys: string[]): Promise<Array<U | undefined>> {
		if (keys.length === 0) {
			return []; // Return empty array if no keys are provided
		}

		keys = keys.map((key) => this.createKeyPrefix(key, this._namespace));
		try {
			const values = await this.mget<U>(keys);

			return values;
		} catch (error) {
			this.emit("error", error);
			if (this.shouldRethrow(error)) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(undefined) as Array<U | undefined>;
		}
	}

	/**
	 * Delete a key from the store. Uses `UNLINK` when `useUnlink` is true, otherwise `DEL`.
	 * @param {string} key - The key to delete.
	 * @returns {Promise<boolean>} `true` if the key was deleted, `false` otherwise.
	 */
	public async delete(key: string): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);
			let deleted = 0;
			deleted = await (this._useUnlink ? client.unlink(key) : client.del(key));

			return deleted > 0;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return false; // Return false if an error occurs
		}
	}

	/**
	 * Delete many keys from the store in a single transaction (or per hash slot in cluster mode).
	 * @param {string[]} keys - The keys to delete.
	 * @returns {Promise<boolean[]>} Per-key deletion flags.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const resultMap = new Map<string, boolean>();
		const prefixedKeys = keys.map((key) => this.createKeyPrefix(key, this._namespace));

		try {
			if (this.isCluster()) {
				// Group keys by slot to avoid CROSSSLOT errors
				const slotMap = this.getSlotMap(prefixedKeys);

				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotKeys]) => {
						const client = await this.getSlotMaster(slot);
						const multi = client.multi();
						for (const key of slotKeys) {
							if (this._useUnlink) {
								multi.unlink(key);
							} else {
								multi.del(key);
							}
						}
						const results = await multi.exec();
						for (const [index, deleted] of results.entries()) {
							/* v8 ignore next -- @preserve */
							resultMap.set(slotKeys[index], typeof deleted === "number" && deleted > 0);
						}
					}),
				);
			} else {
				// Non-cluster mode can use a single multi
				const client = (await this.getClient()) as RedisClientType;
				const multi = client.multi();
				for (const key of prefixedKeys) {
					if (this._useUnlink) {
						multi.unlink(key);
					} else {
						multi.del(key);
					}
				}

				const results = await multi.exec();
				for (const [index, deleted] of results.entries()) {
					resultMap.set(prefixedKeys[index], typeof deleted === "number" && deleted > 0);
				}
			}

			/* v8 ignore next -- @preserve */
			return prefixedKeys.map((key) => resultMap.get(key) ?? false);
		} catch (error) {
			this.emit("error", error);
			if (this.shouldRethrow(error)) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(false) as boolean[];
		}
	}

	/**
	 * Disconnect from the Redis server. Sends `QUIT` (`close`) when `force` is false,
	 * or forcefully destroys the socket when `force` is true.
	 * @param {boolean} [force] - When `true`, destroy the connection instead of a graceful close.
	 * @returns {Promise<void>} Resolves when the client is closed, or immediately if it was not open.
	 * @see {@link https://github.com/redis/node-redis/tree/master/packages/redis#disconnecting}
	 */
	public async disconnect(force?: boolean): Promise<void> {
		if (this._client.isOpen) {
			await (force ? this._client.destroy() : this._client.close());
		}
	}

	/**
	 * Prefix a key with the namespace and {@link keyPrefixSeparator}.
	 * @param {string} key - The key to prefix.
	 * @param {string} [namespace] - The namespace to prefix the key with.
	 * @returns {string} `namespace::key` when a namespace is set, otherwise the original key.
	 */
	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Strip a leading namespace prefix from a key.
	 * @param {string} key - The key to remove the namespace from.
	 * @param {string} [namespace] - The namespace to remove from the start of the key.
	 * @returns {string} The key without the namespace prefix, or the original key if it was not prefixed.
	 */
	public getKeyWithoutPrefix(key: string, namespace?: string): string {
		if (namespace) {
			const prefix = `${namespace}${this._keyPrefixSeparator}`;
			if (key.startsWith(prefix)) {
				return key.slice(prefix.length);
			}
		}

		return key;
	}

	/**
	 * Whether the current connection is a Redis cluster.
	 * @returns {boolean} `true` if the client is a cluster, `false` otherwise.
	 */
	public isCluster(): boolean {
		return this.isClientCluster(this._client);
	}

	/**
	 * Whether the current connection is a Redis sentinel.
	 * @returns {boolean} `true` if the client is a sentinel, `false` otherwise.
	 */
	public isSentinel(): boolean {
		return this.isClientSentinel(this._client);
	}

	/**
	 * Get the master node clients in the cluster. If the client is not a cluster, returns the single client.
	 * @returns {Promise<RedisClientType[]>} Master node clients, or a one-element array with the standalone client.
	 */
	public async getMasterNodes(): Promise<RedisClientType[]> {
		if (this.isCluster()) {
			const cluster = (await this.getClient()) as RedisClusterType<
				RedisModules,
				RedisFunctions,
				RedisScripts,
				RespVersions,
				TypeMapping
			>;
			const nodes = cluster.masters.map(async (main) => cluster.nodeClient(main));
			return Promise.all(nodes) as Promise<RedisClientType[]>;
		}

		return [(await this.getClient()) as RedisClientType];
	}

	/**
	 * Async iterator over keys and values. Uses the instance namespace. With no namespace,
	 * iterates un-prefixed keys unless `noNamespaceAffectsAll` is true.
	 * @returns {AsyncGenerator<[string, U | undefined], void, unknown>} Yields `[key, value]` pairs. Missing values are `undefined`.
	 */
	public async *iterator<U = T>(): AsyncGenerator<[string, U | undefined], void, unknown> {
		// When instance is not a cluster, it will only have one client
		const clients = await this.getMasterNodes();

		for (const client of clients) {
			const match = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}*` : "*";
			let cursor = "0";
			do {
				const result = await client.scan(cursor, {
					MATCH: match,
					COUNT: this._clearBatchSize,
					TYPE: "string",
				});
				cursor = result.cursor.toString();
				let { keys } = result;

				if (!this._namespace && !this._noNamespaceAffectsAll) {
					keys = keys.filter((key) => !key.includes(this._keyPrefixSeparator));
				}

				if (keys.length > 0) {
					const values = await this.mget<U>(keys);
					for (const i of keys.keys()) {
						const key = this.getKeyWithoutPrefix(keys[i], this._namespace);
						const value = values[i];
						yield [key, value];
					}
				}
			} while (cursor !== "0");
		}
	}

	/**
	 * Clear keys in the current namespace. With no namespace, clears un-prefixed keys unless
	 * `noNamespaceAffectsAll` is true (then `FLUSHDB`). Uses `SCAN` in batches of `clearBatchSize`.
	 * Can be expensive on large keyspaces and clusters — not recommended in production.
	 * @returns {Promise<void>} Resolves when the matching keys have been removed.
	 */
	public async clear(): Promise<void> {
		try {
			// When instance is not a cluster, it will only have one client
			const clients = await this.getMasterNodes();

			await Promise.all(
				clients.map(async (client) => {
					if (!this._namespace && this._noNamespaceAffectsAll) {
						await client.flushDb();
						return;
					}

					let cursor = "0";
					const batchSize = this._clearBatchSize;
					const match = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}*` : "*";
					const deletePromises = [];

					do {
						const result = await client.scan(cursor, {
							MATCH: match,
							COUNT: batchSize,
							TYPE: "string",
						});

						cursor = result.cursor.toString();
						let { keys } = result;

						if (keys.length === 0) {
							continue;
						}

						if (!this._namespace) {
							keys = keys.filter((key) => !key.includes(this._keyPrefixSeparator));
						}

						deletePromises.push(this.clearWithClusterSupport(keys));
					} while (cursor !== "0");

					await Promise.all(deletePromises);
				}),
			);
		} catch (error) {
			this.emit("error", error);
			if (this.shouldRethrow(error)) {
				throw error;
			}
		}
	}

	/**
	 * Lazily detect whether the server supports `SET ... PXAT` (Redis 6.2+), caching the result.
	 * Falls back to assuming support (PXAT) when the version cannot be determined (e.g. clusters
	 * where `INFO` isn't directly available, or a transient error) — those deployments are modern.
	 * @param {RedisClientConnectionType} client - The Redis client, cluster, or sentinel connection to introspect.
	 * @returns {Promise<boolean>} `true` if PXAT may be used, `false` to fall back to relative PX.
	 */
	private async supportsPxat(client: RedisClientConnectionType): Promise<boolean> {
		if (this._pxatSupported !== undefined) {
			return this._pxatSupported;
		}

		try {
			const info = String(await (client as RedisClientType).info("server"));
			const match = /redis_version:(\d+)\.(\d+)/.exec(info);
			if (match) {
				const major = Number(match[1]);
				const minor = Number(match[2]);
				this._pxatSupported = major > 6 || (major === 6 && minor >= 2);
			} else {
				this._pxatSupported = true;
			}
		} catch {
			this._pxatSupported = true;
		}

		return this._pxatSupported;
	}

	/**
	 * Build the `SET` expiry option for an absolute `expires`. Prefers the skew-immune absolute
	 * `PXAT`; falls back to a relative `PX` (remaining ms) for servers older than 6.2.
	 * @param {number} expires - Absolute expiry as Unix ms since epoch.
	 * @param {boolean} usePxat - Whether the server supports PXAT (from {@link supportsPxat}).
	 * @returns {{PXAT: number} | {PX: number}} The Redis `SET` expiry option.
	 */
	private expiryOptions(expires: number, usePxat: boolean): { PXAT: number } | { PX: number } {
		// Redis rejects `SET ... PX 0` ("invalid expire time"), so floor the relative fallback at
		// 1ms for an already-elapsed deadline — the key is written and reaped almost immediately,
		// matching how an absolute PXAT in the past behaves (and the memcache exptime floor).
		return usePxat ? { PXAT: expires } : { PX: Math.max(1, expires - Date.now()) };
	}

	/**
	 * Resolve the `SET` expiry option for a single write, detecting PXAT support as needed.
	 * @param {RedisClientConnectionType} client - The Redis client, cluster, or sentinel connection.
	 * @param {number} expires - Absolute expiry as Unix ms since epoch.
	 * @returns {Promise<{PXAT: number} | {PX: number}>} The Redis `SET` expiry option.
	 */
	private async buildExpiryOptions(
		client: RedisClientConnectionType,
		expires: number,
	): Promise<{ PXAT: number } | { PX: number }> {
		return this.expiryOptions(expires, await this.supportsPxat(client));
	}

	/**
	 * Get many keys. In cluster mode, issues one `MGET` per hash slot to avoid CROSSSLOT errors.
	 * Redis `null` replies are mapped to `undefined`.
	 * @param {string[]} keys - Prefixed keys to fetch.
	 * @returns {Promise<Array<T | undefined>>} Values in the same order as `keys`.
	 */
	private async mget<T = KeyvAny>(keys: string[]): Promise<Array<T | undefined>> {
		const valueMap = new Map<string, string | undefined>();

		if (this.isCluster()) {
			// Group keys by slot first to ensure each MGET only contains keys from the same slot
			const slotMap = this.getSlotMap(keys);

			await Promise.all(
				Array.from(slotMap.entries(), async ([slot, slotKeys]) => {
					const client = await this.getSlotMaster(slot);
					const values = await client.mGet(slotKeys);
					for (const [index, value] of values.entries()) {
						valueMap.set(slotKeys[index], value ?? undefined);
					}
				}),
			);
		} else {
			// Non-cluster mode - can do all keys in one MGET
			const client = (await this.getClient()) as RedisClientType;
			const values = await client.mGet(keys);
			for (const [index, value] of values.entries()) {
				valueMap.set(keys[index], value ?? undefined);
			}
		}

		return keys.map((key) => valueMap.get(key) as T | undefined);
	}

	/**
	 * Delete the given keys, grouping by hash slot in cluster mode to avoid CROSSSLOT errors.
	 * @param {string[]} keys - Prefixed keys to delete.
	 * @returns {Promise<void>} Resolves when all slot groups have been deleted.
	 */
	private async clearWithClusterSupport(keys: string[]): Promise<void> {
		/* v8 ignore next -- @preserve */
		if (keys.length > 0) {
			const slotMap = this.getSlotMap(keys);

			await Promise.all(
				Array.from(slotMap.entries(), async ([slot, keys]) => {
					const client = await this.getSlotMaster(slot);

					return this._useUnlink ? client.unlink(keys) : client.del(keys);
				}),
			);
		}
	}

	/**
	 * Return the master node client for a hash slot, or the instance client when not clustered.
	 * @param {number} slot - Redis cluster hash slot.
	 * @returns {Promise<RedisClientType>} The node client that owns `slot`.
	 */
	private async getSlotMaster(slot: number): Promise<RedisClientType> {
		const connection = await this.getClient();

		if (this.isCluster()) {
			const cluster = connection as RedisClusterType<
				RedisModules,
				RedisFunctions,
				RedisScripts,
				RespVersions,
				TypeMapping
			>;
			const mainNode = cluster.slots[slot].master;
			return cluster.nodeClient(mainNode) as RedisClientType;
		}

		return connection as RedisClientType;
	}

	/**
	 * Group keys by their Redis cluster hash slot. Non-cluster clients use a single slot `0` group.
	 * @param {string[]} keys - The keys to group.
	 * @returns {Map<number, string[]>} Map of slot number to keys in that slot.
	 */
	private getSlotMap(keys: string[]): Map<number, string[]> {
		const slotMap = new Map<number, string[]>();
		if (this.isCluster()) {
			for (const key of keys) {
				const slot = calculateSlot(key);
				const slotKeys = slotMap.get(slot) ?? [];
				slotKeys.push(key);
				slotMap.set(slot, slotKeys);
			}
		} else {
			// Non-clustered client supports CROSS-SLOT multi-key command so we set arbitrary slot 0
			slotMap.set(0, keys);
		}

		return slotMap;
	}

	/**
	 * Whether the provided client is a cluster connection.
	 * @param {RedisClientConnectionType} client - The client to check.
	 * @returns {boolean} `true` if `client` exposes cluster `slots`.
	 */
	private isClientCluster(client: RedisClientConnectionType): boolean {
		return (client as KeyvAny).slots !== undefined;
	}

	/**
	 * Whether the provided client is a sentinel connection.
	 * @param {RedisClientConnectionType} client - The client to check.
	 * @returns {boolean} `true` if `client` exposes `getSentinelNode`.
	 */
	private isClientSentinel(client: RedisClientConnectionType): boolean {
		return (client as KeyvAny).getSentinelNode !== undefined;
	}

	/**
	 * Apply defined adapter options to this instance.
	 * @param {KeyvRedisOptions} [options] - Options to apply. Omitted or undefined fields are left unchanged.
	 * @returns {void}
	 */
	private setOptions(options?: KeyvRedisOptions): void {
		if (!options) {
			return;
		}

		if (options.namespace) {
			this._namespace = options.namespace;
		}

		if (options.keyPrefixSeparator !== undefined) {
			this._keyPrefixSeparator = options.keyPrefixSeparator;
		}

		if (options.clearBatchSize !== undefined && options.clearBatchSize > 0) {
			this._clearBatchSize = options.clearBatchSize;
		}

		if (options.useUnlink !== undefined) {
			this._useUnlink = options.useUnlink;
		}

		if (options.noNamespaceAffectsAll !== undefined) {
			this._noNamespaceAffectsAll = options.noNamespaceAffectsAll;
		}

		if (options.throwOnConnectError !== undefined) {
			this._throwOnConnectError = options.throwOnConnectError;
		}

		if (options.throwOnErrors !== undefined) {
			this._throwOnErrors = options.throwOnErrors;
		}

		if (options.connectionTimeout !== undefined) {
			this._connectionTimeout = options.connectionTimeout;
		}
	}

	/**
	 * Re-emit client `error`, `connect`, `disconnect`, and `reconnecting` events on this adapter
	 * via Hookified. Listeners are attached once per client instance. Replacing `client` removes
	 * listeners from the previous connection.
	 * @returns {void}
	 */
	private initClient(): void {
		if (this._eventsWiredClient === this._client) {
			return;
		}

		if (this._eventsWiredClient) {
			this._eventsWiredClient.removeListener("error", this._errorHandler);
			this._eventsWiredClient.removeListener("connect", this._connectHandler);
			this._eventsWiredClient.removeListener("disconnect", this._disconnectHandler);
			this._eventsWiredClient.removeListener("reconnecting", this._reconnectingHandler);
		}

		this._eventsWiredClient = this._client;

		this._client.on("error", this._errorHandler);
		this._client.on("connect", this._connectHandler);
		/* v8 ignore next -- @preserve */
		this._client.on("disconnect", this._disconnectHandler);
		/* v8 ignore next -- @preserve */
		this._client.on("reconnecting", this._reconnectingHandler);
	}

	/**
	 * Whether an operation error should be re-thrown after being emitted. Connection failures
	 * honor `throwOnConnectError`; all other failures honor `throwOnErrors`.
	 * @param {unknown} error - The caught error.
	 * @returns {boolean} `true` when the caller should rethrow.
	 */
	private shouldRethrow(error: unknown): boolean {
		if (
			this._throwOnConnectError &&
			error instanceof Error &&
			error.message === RedisErrorMessages.RedisClientNotConnectedThrown
		) {
			return true;
		}

		return this._throwOnErrors;
	}

	/**
	 * Race a promise against a timeout, always clearing the timer so a successful connect
	 * does not leave a dangling rejection.
	 * @template T
	 * @param {Promise<T>} promise - The promise to race.
	 * @param {number} timeoutMs - Timeout in milliseconds before the race rejects.
	 * @returns {Promise<T>} The original promise result, or a timeout rejection.
	 */
	private async raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			const timeout = new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					reject(new Error(`Redis timed out after ${timeoutMs}ms`));
				}, timeoutMs);
			});
			return await Promise.race([promise, timeout]);
		} finally {
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
		}
	}
}

export {
	createClient,
	createCluster,
	createSentinel,
	type RedisClientOptions,
	type RedisClientType,
	type RedisClusterOptions,
	type RedisClusterType,
	type RedisSentinelOptions,
	type RedisSentinelType,
} from "@redis/client";
export { Keyv } from "keyv";
export { createKeyv, createKeyvNonBlocking } from "./create.js";
