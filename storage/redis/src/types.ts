import type {
	RedisClientOptions,
	RedisClientType,
	RedisClusterOptions,
	RedisClusterType,
	RedisFunctions,
	RedisModules,
	RedisScripts,
	RedisSentinelOptions,
	RedisSentinelType,
	RespVersions,
	TypeMapping,
} from "@redis/client";

export type KeyvRedisOptions = {
	/**
	 * Namespace for the current instance. When undefined, no namespace prefixing is applied.
	 * @default undefined
	 */
	namespace?: string;
	/**
	 * Separator to use between namespace and key.
	 * @default "::"
	 */
	keyPrefixSeparator?: string;
	/**
	 * Number of keys to delete in a single batch.
	 * @default 1000
	 */
	clearBatchSize?: number;
	/**
	 * Enable Unlink instead of using Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 * @default true
	 */
	useUnlink?: boolean;

	/**
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * @default false
	 */
	noNamespaceAffectsAll?: boolean;

	/**
	 * Throw an error if the client is not connected when trying to connect. By default this is
	 * `true` so a failed Redis connection throws.
	 * @default true
	 */
	throwOnConnectError?: boolean;

	/**
	 * Throw an error if any operation fails. When `false`, failures emit an `error` event
	 * and return no-op responses (`undefined` for gets, `false` for writes/deletes).
	 * @default false
	 */
	throwOnErrors?: boolean;

	/**
	 * Timeout in milliseconds for the connection. When undefined, the Redis client default is used.
	 * If set, connection that does not succeed within this time throws.
	 * @default undefined
	 */
	connectionTimeout?: number;
};

export type KeyvRedisPropertyOptions = KeyvRedisOptions & {
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
	 * Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 */
	expires?: number;
};

export enum RedisErrorMessages {
	/**
	 * Error message when the Redis client is not connected and throwOnConnectError is set to true.
	 */
	RedisClientNotConnectedThrown = "Redis client is not connected or has failed to connect. This is thrown because throwOnConnectError is set to true.",
}

/**
 * Default socket reconnect strategy used when a URI string is passed to the constructor.
 * Exponential backoff capped at 2s, plus up to ±50ms of jitter.
 * @param {number} attempts - The current reconnection attempt count (0-based).
 * @returns {number | Error} Delay in milliseconds before the next attempt.
 */
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
	| RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;

export type RedisConnectionClusterType =
	| RedisClusterType
	| RedisClusterType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisClusterType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;

export type RedisConnectionSentinelType =
	| RedisSentinelType
	| RedisSentinelType<RedisModules, RedisFunctions, RedisScripts, RespVersions>
	| RedisSentinelType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>;

export type RedisClientConnectionType =
	| RedisConnectionClientType
	| RedisConnectionClusterType
	| RedisConnectionSentinelType;

/**
 * First argument to the {@link KeyvRedis} constructor and {@link createKeyv}: a URI string,
 * `@redis/client` client/cluster/sentinel options, or an already-created connection.
 *
 * @example
 * ```ts
 * new KeyvRedis("redis://localhost:6379");
 * new KeyvRedis({ url: "redis://localhost:6379" });
 * new KeyvRedis({ rootNodes: [{ url: "redis://localhost:7001" }] });
 * ```
 */
export type KeyvRedisConnect =
	| string
	| RedisClientOptions
	| RedisClusterOptions
	| RedisSentinelOptions
	| RedisClientConnectionType;
