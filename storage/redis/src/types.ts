// biome-ignore-all lint/suspicious/noExplicitAny: redis
import type {
	RedisClientType,
	RedisClusterType,
	RedisFunctions,
	RedisModules,
	RedisScripts,
	RedisSentinelType,
	RespVersions,
	TypeMapping,
} from "@redis/client";

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
