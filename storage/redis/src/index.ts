// biome-ignore-all lint/suspicious/noExplicitAny: redis
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
import { type KeyvStorageAdapter, type KeyvStorageEntry, keyvStorageCapability } from "keyv";
import {
	defaultReconnectStrategy,
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
	type KeyvRedisEntry,
	type KeyvRedisOptions,
	type KeyvRedisPropertyOptions,
	type RedisClientConnectionType,
	type RedisConnectionClientType,
	type RedisConnectionClusterType,
	type RedisConnectionSentinelType,
	RedisErrorMessages,
};

export default class KeyvRedis<T> extends Hookified implements KeyvStorageAdapter {
	/** Declares the v6 absolute-`expires` storage contract via `capabilities.expires`. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

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
	 * Tracks the client instance whose events have already been wired up so that
	 * repeated initialization does not attach duplicate listeners.
	 */
	private _eventsWiredClient: RedisClientConnectionType | undefined;

	/**
	 * KeyvRedis constructor.
	 * @param {string | RedisClientOptions | RedisClientType} [connect] How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client.
	 * @param {KeyvRedisOptions} [options] Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
	 */
	constructor(
		connect?:
			| string
			| RedisClientOptions
			| RedisClusterOptions
			| RedisSentinelOptions
			| RedisClientConnectionType,
		options?: KeyvRedisOptions,
	) {
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
			} else if ((connect as any).connect !== undefined) {
				if (this.isClientSentinel(connect as RedisClientConnectionType)) {
					this._client = connect as RedisConnectionSentinelType;
				} else if (this.isClientCluster(connect as RedisClientConnectionType)) {
					this._client = connect as RedisConnectionClusterType;
				} else {
					this._client = connect as RedisClientType;
				}
			} else if (connect instanceof Object) {
				if ((connect as any).sentinelRootNodes !== undefined) {
					this._client = createSentinel(connect as RedisSentinelOptions) as RedisSentinelType;
				} else if ((connect as any).rootNodes === undefined) {
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
	 * Get the Redis client, cluster, or sentinel connection.
	 * @returns {RedisClientConnectionType} The current Redis client connection.
	 */
	public get client(): RedisClientConnectionType {
		return this._client;
	}

	/**
	 * Set the Redis client, cluster, or sentinel connection. This will re-wire the event listeners.
	 * @param {RedisClientConnectionType} value - The Redis client connection to use.
	 */
	public set client(value: RedisClientConnectionType) {
		this._client = value;
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
	 * Get the connected Redis client. If the client is not already connected it will connect first, respecting
	 * the connectionTimeout. If the connection fails it will emit an error event and, when throwOnConnectError
	 * is true, throw an error.
	 * @returns {Promise<RedisClientConnectionType>} The connected Redis client.
	 */
	public async getClient(): Promise<RedisClientConnectionType> {
		if (this._client.isOpen) {
			return this._client;
		}

		try {
			if (this._connectionTimeout === undefined) {
				await this._client.connect();
			} else {
				await Promise.race([
					this._client.connect(),
					this.createTimeoutPromise(this._connectionTimeout),
				]);
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
	 * @param {string} key - the key to set
	 * @param {string} value - the value to set
	 * @param {number} [expires] - absolute expiry as Unix ms since epoch, or undefined for no expiry
	 * @returns {Promise<boolean>} - true if the value was set, false if an error occurred and throwOnErrors is false
	 */
	public async set(key: string, value: string, expires?: number): Promise<boolean> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			if (typeof expires === "number") {
				await client.set(key, value, { PXAT: expires });
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
	 * Will set many key value pairs in the store. Expiry is an absolute Unix timestamp in milliseconds. This will be done as a single transaction.
	 * @param {KeyvStorageEntry[]} entries - the key value pairs to set with optional absolute expires
	 * @returns {Promise<boolean[] | undefined>} - array of booleans indicating whether each entry was successfully set
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
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
						const multi = client.multi();
						for (const {
							entry: { key, value, expires },
						} of slotEntries) {
							const prefixedKey = this.createKeyPrefix(key, this._namespace);
							if (typeof expires === "number") {
								multi.set(prefixedKey, value as string, { PXAT: expires });
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
				const multi = client.multi();
				for (const { key, value, expires } of entries) {
					const prefixedKey = this.createKeyPrefix(key, this._namespace);
					if (typeof expires === "number") {
						multi.set(prefixedKey, value as string, { PXAT: expires });
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
			// Re-throw connection errors if throwOnConnectError is true
			/* v8 ignore next -- @preserve */
			if (
				this._throwOnConnectError &&
				(error as Error).message === RedisErrorMessages.RedisClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}

			return entries.map(() => false);
		}
	}

	/**
	 * Check if a key exists in the store.
	 * @param {string} key - the key to check
	 * @returns {Promise<boolean>} - true if the key exists, false if not
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
	 * Check if many keys exist in the store. This will be done as a single transaction.
	 * @param {Array<string>} keys - the keys to check
	 * @returns {Promise<Array<boolean>>} - array of booleans for each key if it exists
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
			// Re-throw connection errors if throwOnConnectError is true
			/* v8 ignore next -- @preserve */
			if (
				this._throwOnConnectError &&
				(error as Error).message === RedisErrorMessages.RedisClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(false) as boolean[];
		}
	}

	/**
	 * Get a value from the store. If the key does not exist, it will return undefined.
	 * @param {string} key - the key to get
	 * @returns {Promise<string | undefined>} - the value or undefined if the key does not exist
	 */
	public async get<U = T>(key: string): Promise<U | undefined> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			const value = await client.get(key);
			if (value === null) {
				return undefined;
			}

			return value as U;
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return undefined; // Return undefined if an error occurs
		}
	}

	/**
	 * Get many values from the store. If a key does not exist, it will return undefined.
	 * @param {Array<string>} keys - the keys to get
	 * @returns {Promise<Array<string | undefined>>} - array of values or undefined if the key does not exist
	 */
	public async getMany<U = T>(keys: string[]): Promise<Array<U | undefined>> {
		if (keys.length === 0) {
			return []; // Return empty array if no keys are provided
		}

		keys = keys.map((key) => this.createKeyPrefix(key, this._namespace));
		try {
			const values = await this.mget<U>(keys);

			return values;
			/* c8 ignore next 5 */
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(undefined) as Array<U | undefined>;
		}
	}

	/**
	 * Delete a key from the store.
	 * @param {string} key - the key to delete
	 * @returns {Promise<boolean>} - true if the key was deleted, false if not
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
	 * Delete many keys from the store. This will be done as a single transaction.
	 * @param {Array<string>} keys - the keys to delete
	 * @returns {Promise<boolean[]>} - array of booleans indicating whether each key was successfully deleted
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
			// Re-throw connection errors if throwOnConnectError is true
			if (
				this._throwOnConnectError &&
				(error as Error).message === RedisErrorMessages.RedisClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}

			return Array.from({ length: keys.length }).fill(false) as boolean[];
		}
	}

	/**
	 * Disconnect from the Redis server.
	 * @returns {Promise<void>}
	 * @param {boolean} [force] - it will send a quit command if false, otherwise it will send a disconnect command to forcefully disconnect.
	 * @see {@link https://github.com/redis/node-redis/tree/master/packages/redis#disconnecting}
	 */
	public async disconnect(force?: boolean): Promise<void> {
		if (this._client.isOpen) {
			await (force ? this._client.destroy() : this._client.close());
		}
	}

	/**
	 * Helper function to create a key with a namespace.
	 * @param {string} key - the key to prefix
	 * @param {string} namespace - the namespace to prefix the key with
	 * @returns {string} - the key with the namespace such as 'namespace::key'
	 */
	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Helper function to get a key without the namespace.
	 * @param {string} key - the key to remove the namespace from
	 * @param {string} namespace - the namespace to remove from the key
	 * @returns {string} - the key without the namespace such as 'key'
	 */
	public getKeyWithoutPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, "");
		}

		return key;
	}

	/**
	 * Is the client a cluster.
	 * @returns {boolean} - true if the client is a cluster, false if not
	 */
	public isCluster(): boolean {
		return this.isClientCluster(this._client);
	}

	/**
	 * Is the client a sentinel.
	 * @returns {boolean} - true if the client is a sentinel, false if not
	 */
	public isSentinel(): boolean {
		return this.isClientSentinel(this._client);
	}

	/**
	 * Get the master nodes in the cluster. If not a cluster, it will return the single client.
	 *
	 * @returns {Promise<RedisClientType[]>} - array of master nodes
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
	 * Get an async iterator for the keys and values in the store. The namespace is not passed in and instead
	 * uses the namespace configured on the instance. It will only iterate over keys with the current namespace.
	 * If no namespace is set it will iterate over keys with no namespace prefix unless noNamespaceAffectsAll is true.
	 * @returns {AsyncGenerator<[string, U | undefined], void, unknown>} - async iterator with key value pairs
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
	 * Clear all keys in the store.
	 * IMPORTANT: this can cause performance issues if there are a large number of keys in the store and worse with clusters. Use with caution as not recommended for production.
	 * If a namespace is not set it will clear all keys with no prefix.
	 * If a namespace is set it will clear all keys with that namespace.
	 * @returns {Promise<void>}
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
			/* v8 ignore next -- @preserve */
			this.emit("error", error);
		}
	}

	/**
	 * Get many keys. If the instance is a cluster, it will do multiple MGET calls
	 * by separating the keys by slot to solve the CROSS-SLOT restriction.
	 */
	private async mget<T = any>(keys: string[]): Promise<Array<T | undefined>> {
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
	 * Clear all keys in the store with a specific namespace. If the instance is a cluster, it will clear all keys
	 * by separating the keys by slot to solve the CROSS-SLOT restriction.
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
	 * Returns the master node client for a given slot or the instance's client if it's not a cluster.
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
	 * Group keys by their slot.
	 *
	 * @param {string[]} keys - the keys to group
	 * @returns {Map<number, string[]>} - map of slot to keys
	 */
	private getSlotMap(keys: string[]) {
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
	 * Check if the provided client is a cluster client.
	 * @param {RedisClientConnectionType} client - the client to check
	 * @returns {boolean} - true if the client is a cluster client, false if not
	 */
	private isClientCluster(client: RedisClientConnectionType): boolean {
		return (client as any).slots !== undefined;
	}

	/**
	 * Check if the provided client is a sentinel client.
	 * @param {RedisClientConnectionType} client - the client to check
	 * @returns {boolean} - true if the client is a sentinel client, false if not
	 */
	private isClientSentinel(client: RedisClientConnectionType): boolean {
		return (client as any).getSentinelNode !== undefined;
	}

	/**
	 * Apply the provided options to the instance. Only defined options are applied.
	 * @param {KeyvRedisOptions} [options] - the options to apply
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
	 * Wire up the client events (error, connect, disconnect, reconnecting) to be re-emitted on this instance.
	 * Listeners are only attached once per client instance to avoid duplicates.
	 */
	private initClient(): void {
		// Only wire up listeners once per client instance so that repeated calls
		// (for example on reconnect via getClient) do not accumulate duplicate listeners.
		if (this._eventsWiredClient === this._client) {
			return;
		}

		this._eventsWiredClient = this._client;

		this._client.on("error", (error) => {
			this.emit("error", error);
		});

		this._client.on("connect", () => {
			this.emit("connect", this._client);
		});

		/* v8 ignore next -- @preserve */
		this._client.on("disconnect", () => {
			this.emit("disconnect", this._client);
		});

		/* v8 ignore next -- @preserve */
		this._client.on("reconnecting", (reconnectInfo) => {
			this.emit("reconnecting", reconnectInfo);
		});
	}

	/**
	 * Create a promise that rejects after the provided timeout. Used to race against the connection.
	 * @param {number} timeoutMs - the timeout in milliseconds before the promise rejects
	 * @returns {Promise<never>} - a promise that always rejects once the timeout elapses
	 */
	private async createTimeoutPromise(timeoutMs: number): Promise<never> {
		return new Promise<never>((_, reject) =>
			setTimeout(() => {
				/* v8 ignore next 3 -- @preserve */
				reject(new Error(`Redis timed out after ${timeoutMs}ms`));
			}, timeoutMs),
		);
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
