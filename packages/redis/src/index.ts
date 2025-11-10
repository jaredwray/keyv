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
import { Keyv, type KeyvEntry, type KeyvStoreAdapter } from "keyv";

export type KeyvRedisOptions = {
	/**
	 * Namespace for the current instance.
	 * Defaults to `keyv`
	 */
	namespace?: string;
	/**
	 * Separator to use between namespace and key.
	 */
	keyPrefixSeparator?: string;
	/**
	 * Number of keys to delete in a single batch.
	 */
	clearBatchSize?: number;
	/**
	 * Enable Unlink instead of using Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 */
	useUnlink?: boolean;

	/**
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * Defaults to `false`.
	 */
	noNamespaceAffectsAll?: boolean;

	/**
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the Redis server fails.
	 */
	throwOnConnectError?: boolean;

	/**
	 * This is used to throw an error if at any point there is a failure. Use this if you want to
	 * ensure that all operations are successful and you want to handle errors. By default, this is
	 * set to false so that it does not throw an error on every operation and instead emits an error event
	 * and returns no-op responses.
	 * @default false
	 */
	throwOnErrors?: boolean;

	/**
	 * Timeout in milliseconds for the connection. Default is undefined, which uses the default timeout of the Redis client.
	 * If set, it will throw an error if the connection does not succeed within the specified time.
	 * @default undefined
	 */
	connectionTimeout?: number;
};

export type KeyvRedisPropertyOptions = KeyvRedisOptions & {
	/**
	 * Dialect used by the adapter. This is legacy so Keyv knows what is iteratable.
	 */
	dialect: "redis";
	/**
	 * URL used to connect to the Redis server. This is legacy so Keyv knows what is iteratable.
	 */
	url: string;
};

export type KeyvRedisEntry<T> = {
	/**
	 * Key to set.
	 */
	key: string;
	/**
	 * Value to set.
	 */
	value: T;
	/**
	 * Time to live in milliseconds.
	 */
	ttl?: number;
};

export enum RedisErrorMessages {
	/**
	 * Error message when the Redis client is not connected and throwOnConnectError is set to true.
	 */
	RedisClientNotConnectedThrown = "Redis client is not connected or has failed to connect. This is thrown because throwOnConnectError is set to true.",
}

export const defaultReconnectStrategy = (attempts: number): number | Error => {
	// Exponential backoff base: double each time, capped at 2s.
	// Parentheses make it clear we do (2 ** attempts) first, then * 100
	const backoff = Math.min(2 ** attempts * 100, 2000);

	// Add random jitter of up to ±50ms to avoid thundering herds:
	const jitter = (Math.random() - 0.5) * 100;

	return backoff + jitter;
};

export type RedisConnectionClientType =
	| RedisClientType
	| RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisClientType<
			RedisModules,
			RedisFunctions,
			RedisScripts,
			RespVersions,
			TypeMapping
	  >;

export type RedisConnectionClusterType =
	| RedisClusterType
	| RedisClusterType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisClusterType<
			RedisModules,
			RedisFunctions,
			RedisScripts,
			RespVersions,
			TypeMapping
	  >;

export type RedisConnectionSentinelType =
	| RedisSentinelType
	| RedisSentinelType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisSentinelType<
			RedisModules,
			RedisFunctions,
			RedisScripts,
			RespVersions,
			TypeMapping
	  >;

export type RedisClientConnectionType =
	| RedisConnectionClientType
	| RedisConnectionClusterType
	| RedisConnectionSentinelType;

export default class KeyvRedis<T>
	extends Hookified
	implements KeyvStoreAdapter
{
	private _client: RedisClientConnectionType =
		createClient() as RedisConnectionClientType;
	private _namespace: string | undefined;
	private _keyPrefixSeparator = "::";
	private _clearBatchSize = 1000;
	private _useUnlink = true;
	private _noNamespaceAffectsAll = false;
	private _throwOnConnectError = true;
	private _throwOnErrors = false;
	private _connectionTimeout: number | undefined;

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
		super();

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
					this._client = createSentinel(
						connect as RedisSentinelOptions,
					) as RedisSentinelType;
				} else if ((connect as any).rootNodes === undefined) {
					this._client = createClient(
						connect as RedisClientOptions,
					) as RedisClientType;
				} else {
					this._client = createCluster(connect as RedisClusterOptions);
				}
			}
		}

		this.setOptions(options);
		this.initClient();
	}

	/**
	 * Get the Redis client.
	 */
	public get client(): RedisClientConnectionType {
		return this._client;
	}

	/**
	 * Set the Redis client.
	 */
	public set client(value: RedisClientConnectionType) {
		this._client = value;
		this.initClient();
	}

	/**
	 * Get the options for the adapter.
	 */
	public get opts(): KeyvRedisPropertyOptions {
		let url = "redis://localhost:6379";
		if ((this._client as RedisClientType).options) {
			const redisUrl = (this._client as RedisClientType).options?.url;
			if (redisUrl) {
				url = redisUrl;
			}
		}

		const results: KeyvRedisPropertyOptions = {
			namespace: this._namespace,
			keyPrefixSeparator: this._keyPrefixSeparator,
			clearBatchSize: this._clearBatchSize,
			noNamespaceAffectsAll: this._noNamespaceAffectsAll,
			useUnlink: this._useUnlink,
			throwOnConnectError: this._throwOnConnectError,
			throwOnErrors: this._throwOnErrors,
			connectionTimeout: this._connectionTimeout,
			dialect: "redis",
			url,
		};

		return results;
	}

	/**
	 * Set the options for the adapter.
	 */
	public set opts(options: KeyvRedisOptions) {
		this.setOptions(options);
	}

	/**
	 * Get the namespace for the adapter. If undefined, it will not use a namespace including keyPrefixing.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. If undefined, it will not use a namespace including keyPrefixing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the separator between the namespace and key.
	 * @default '::'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Set the separator between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Get the number of keys to delete in a single batch.
	 * @default 1000
	 */
	public get clearBatchSize(): number {
		return this._clearBatchSize;
	}

	/**
	 * Set the number of keys to delete in a single batch.
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
	 * @default true
	 */
	public get useUnlink(): boolean {
		return this._useUnlink;
	}

	/**
	 * Set if Unlink is used instead of Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 */
	public set useUnlink(value: boolean) {
		this._useUnlink = value;
	}

	/**
	 * Get if no namespace affects all keys.
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * @default false
	 */
	public get noNamespaceAffectsAll(): boolean {
		return this._noNamespaceAffectsAll;
	}

	/**
	 * Set if not namespace affects all keys.
	 */
	public set noNamespaceAffectsAll(value: boolean) {
		this._noNamespaceAffectsAll = value;
	}

	/**
	 * Get if throwOnConnectError is set to true.
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the Redis server fails.
	 * @default true
	 */
	public get throwOnConnectError(): boolean {
		return this._throwOnConnectError;
	}

	/**
	 * Set if throwOnConnectError is set to true.
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the Redis server fails.
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
	 */
	public set throwOnErrors(value: boolean) {
		this._throwOnErrors = value;
	}

	/**
	 * Get the connection timeout in milliseconds such as 5000 (5 seconds). Default is undefined. If undefined, it will use the default.
	 * @default undefined
	 */
	public get connectionTimeout(): number | undefined {
		return this._connectionTimeout;
	}

	/**
	 * Set the connection timeout in milliseconds such as 5000 (5 seconds). Default is undefined. If undefined, it will use the default.
	 * @default undefined
	 */
	public set connectionTimeout(value: number | undefined) {
		this._connectionTimeout = value;
	}

	/**
	 * Get the Redis URL used to connect to the server. This is used to get a connected client.
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
	 * Set a key value pair in the store. TTL is in milliseconds.
	 * @param {string} key - the key to set
	 * @param {string} value - the value to set
	 * @param {number} [ttl] - the time to live in milliseconds
	 */
	public async set(key: string, value: string, ttl?: number): Promise<void> {
		const client = await this.getClient();

		try {
			key = this.createKeyPrefix(key, this._namespace);

			if (ttl) {
				await client.set(key, value, { PX: ttl });
			} else {
				await client.set(key, value);
			}
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}
	}

	/**
	 * Will set many key value pairs in the store. TTL is in milliseconds. This will be done as a single transaction.
	 * @param {KeyvEntry[]} entries - the key value pairs to set with optional ttl
	 */
	public async setMany(entries: KeyvEntry[]): Promise<void> {
		try {
			if (this.isCluster()) {
				// Ensure cluster is connected first
				await this.getClient();

				// Group entries by slot to avoid CROSSSLOT errors
				const slotMap = new Map<number, KeyvEntry[]>();
				for (const entry of entries) {
					const prefixedKey = this.createKeyPrefix(entry.key, this._namespace);
					const slot = calculateSlot(prefixedKey);
					const slotEntries = slotMap.get(slot) ?? [];
					slotEntries.push(entry);
					slotMap.set(slot, slotEntries);
				}

				// Execute multi for each slot group
				await Promise.all(
					Array.from(slotMap.entries(), async ([slot, slotEntries]) => {
						const client = await this.getSlotMaster(slot);
						const multi = client.multi();
						for (const { key, value, ttl } of slotEntries) {
							const prefixedKey = this.createKeyPrefix(key, this._namespace);
							if (ttl) {
								multi.set(prefixedKey, value, { PX: ttl });
							} else {
								multi.set(prefixedKey, value);
							}
						}
						await multi.exec();
					}),
				);
			} else {
				// Non-cluster mode can use a single multi
				const client = (await this.getClient()) as RedisClientType;
				const multi = client.multi();
				for (const { key, value, ttl } of entries) {
					const prefixedKey = this.createKeyPrefix(key, this._namespace);
					if (ttl) {
						multi.set(prefixedKey, value, { PX: ttl });
					} else {
						multi.set(prefixedKey, value);
					}
				}
				await multi.exec();
			}
		} catch (error) {
			this.emit("error", error);
			// Re-throw connection errors if throwOnConnectError is true
			/* v8 ignore next -- @preserve */
			if (
				this._throwOnConnectError &&
				(error as Error).message ===
					RedisErrorMessages.RedisClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}
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
			const prefixedKeys = keys.map((key) =>
				this.createKeyPrefix(key, this._namespace),
			);

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
							resultMap.set(
								slotKeys[index],
								typeof result === "number" && result === 1,
							);
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
				return results.map(
					(result) => typeof result === "number" && result === 1,
				);
			}
		} catch (error) {
			this.emit("error", error);
			// Re-throw connection errors if throwOnConnectError is true
			/* v8 ignore next -- @preserve */
			if (
				this._throwOnConnectError &&
				(error as Error).message ===
					RedisErrorMessages.RedisClientNotConnectedThrown
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

			return Array.from({ length: keys.length }).fill(undefined) as Array<
				U | undefined
			>;
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
	 * @returns {Promise<boolean>} - true if any key was deleted, false if not
	 */
	public async deleteMany(keys: string[]): Promise<boolean> {
		let result = false;

		try {
			const prefixedKeys = keys.map((key) =>
				this.createKeyPrefix(key, this._namespace),
			);

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
						for (const deleted of results) {
							/* v8 ignore next -- @preserve */
							if (typeof deleted === "number" && deleted > 0) {
								result = true;
							}
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
				for (const deleted of results) {
					if (typeof deleted === "number" && deleted > 0) {
						result = true;
					}
				}
			}
		} catch (error) {
			this.emit("error", error);
			// Re-throw connection errors if throwOnConnectError is true
			if (
				this._throwOnConnectError &&
				(error as Error).message ===
					RedisErrorMessages.RedisClientNotConnectedThrown
			) {
				throw error;
			}
			if (this._throwOnErrors) {
				throw error;
			}
		}

		return result;
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
			const nodes = cluster.masters.map(async (main) =>
				cluster.nodeClient(main),
			);
			return Promise.all(nodes) as Promise<RedisClientType[]>;
		}

		return [(await this.getClient()) as RedisClientType];
	}

	/**
	 * Get an async iterator for the keys and values in the store. If a namespace is provided, it will only iterate over keys with that namespace.
	 * @param {string} [namespace] - the namespace to iterate over
	 * @returns {AsyncGenerator<[string, T | undefined], void, unknown>} - async iterator with key value pairs
	 */
	public async *iterator<U = T>(
		namespace?: string,
	): AsyncGenerator<[string, U | undefined], void, unknown> {
		// When instance is not a cluster, it will only have one client
		const clients = await this.getMasterNodes();

		for (const client of clients) {
			const match = namespace
				? `${namespace}${this._keyPrefixSeparator}*`
				: "*";
			let cursor = "0";
			do {
				const result = await client.scan(cursor, {
					MATCH: match,
					TYPE: "string",
				});
				cursor = result.cursor.toString();
				let { keys } = result;

				if (!namespace && !this._noNamespaceAffectsAll) {
					keys = keys.filter((key) => !key.includes(this._keyPrefixSeparator));
				}

				if (keys.length > 0) {
					const values = await this.mget<U>(keys);
					for (const i of keys.keys()) {
						const key = this.getKeyWithoutPrefix(keys[i], namespace);
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
					const match = this._namespace
						? `${this._namespace}${this._keyPrefixSeparator}*`
						: "*";
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
							keys = keys.filter(
								(key) => !key.includes(this._keyPrefixSeparator),
							);
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

	private isClientCluster(client: RedisClientConnectionType): boolean {
		return (client as any).slots !== undefined;
	}

	private isClientSentinel(client: RedisClientConnectionType): boolean {
		return (client as any).getSentinelNode !== undefined;
	}

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

	private initClient(): void {
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

	private async createTimeoutPromise(timeoutMs: number): Promise<never> {
		return new Promise<never>((_, reject) =>
			setTimeout(() => {
				/* v8 ignore next 3 -- @preserve */
				reject(new Error(`Redis timed out after ${timeoutMs}ms`));
			}, timeoutMs),
		);
	}
}

/**
 * Will create a Keyv instance with the Redis adapter. This will also set the namespace and useKeyPrefix to false.
 * @param connect - How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client. If nothing is passed in, it will default to 'redis://localhost:6379'.
 * @param {KeyvRedisOptions} options - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Keyv} - Keyv instance with the Redis adapter
 */
export function createKeyv(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: KeyvRedisOptions,
): Keyv {
	connect ??= "redis://localhost:6379";
	const adapter = new KeyvRedis(connect, options);

	if (options?.namespace) {
		adapter.namespace = options.namespace;
		const keyv = new Keyv(adapter, {
			namespace: options?.namespace,
			useKeyPrefix: false,
		});

		if (options?.throwOnConnectError) {
			// Set the throwOnError in Keyv so it throws
			keyv.throwOnErrors = true;
		}

		if (options?.throwOnErrors) {
			// Set the throwOnError in Keyv so it throws
			keyv.throwOnErrors = true;
		}

		return keyv;
	}

	const keyv = new Keyv(adapter, { useKeyPrefix: false });

	if (options?.throwOnConnectError) {
		// Set the throwOnError in Keyv so it throws
		keyv.throwOnErrors = true;
	}

	if (options?.throwOnErrors) {
		// Set the throwOnError in Keyv so it throws
		keyv.throwOnErrors = true;
	}

	keyv.namespace = undefined; // Ensure no namespace is set
	return keyv;
}

export function createKeyvNonBlocking(
	connect?: string | RedisClientOptions | RedisClientType,
	options?: KeyvRedisOptions,
): Keyv {
	const keyv = createKeyv(connect, options);

	const keyvStore = keyv.store as KeyvRedis<any>;

	keyvStore.throwOnConnectError = false;
	keyvStore.throwOnErrors = false;

	const redisClient = keyvStore.client as RedisClientType;
	/* v8 ignore next -- @preserve */
	if (redisClient.options) {
		redisClient.options.disableOfflineQueue = true;
		if (redisClient.options.socket) {
			redisClient.options.socket.reconnectStrategy = false;
		}
	}

	keyv.throwOnErrors = false;

	return keyv;
}

export {
	createClient,
	createCluster,
	createSentinel,
	type RedisClientOptions,
	type RedisClientType,
	type RedisClusterOptions,
	type RedisClusterType,
	type RedisSentinelType,
} from "@redis/client";

export { Keyv } from "keyv";
