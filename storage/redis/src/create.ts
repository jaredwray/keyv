import type { RedisClientType } from "@redis/client";
import { Keyv, type KeyvAny } from "keyv";
import KeyvRedis from "./index.js";
import type { KeyvRedisConnect, KeyvRedisOptions } from "./types.js";

/**
 * Create a Keyv instance with the Redis adapter. Namespace is applied on both Keyv and the
 * adapter so keys are prefixed once (`namespace::key` with the default separator).
 * @param {KeyvRedisConnect} [connect] - How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client. If nothing is passed in, it will default to 'redis://localhost:6379'.
 * @param {KeyvRedisOptions} [options] - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Keyv} - Keyv instance with the Redis adapter
 */
export function createKeyv(connect?: KeyvRedisConnect, options?: KeyvRedisOptions): Keyv {
	connect ??= "redis://localhost:6379";
	const adapter = new KeyvRedis(connect, options);
	const keyv = new Keyv({
		store: adapter,
		namespace: adapter.namespace,
	});

	if (options?.throwOnConnectError || options?.throwOnErrors) {
		keyv.throwOnErrors = true;
	}

	return keyv;
}

/**
 * Will create a non-blocking Keyv instance with the Redis adapter. This does everything `createKeyv` does but also
 * disables throwing errors, removes the offline queue, and disables the reconnect strategy so that when used as a
 * secondary cache (such as with cacheable) it does not block the primary cache on connection errors or timeouts.
 * @param {KeyvRedisConnect} [connect] - How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client. If nothing is passed in, it will default to 'redis://localhost:6379'.
 * @param {KeyvRedisOptions} [options] - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Keyv} - non-blocking Keyv instance with the Redis adapter
 */
export function createKeyvNonBlocking(
	connect?: KeyvRedisConnect,
	options?: KeyvRedisOptions,
): Keyv {
	const keyv = createKeyv(connect, options);

	const keyvStore = keyv.store as KeyvRedis<KeyvAny>;

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
