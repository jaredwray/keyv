import type { RedisClientType } from "@redis/client";
import { Keyv, type KeyvAny } from "keyv";
import KeyvRedis from "./index.js";
import type { KeyvRedisConnect, KeyvRedisOptions } from "./types.js";

/**
 * Create a Keyv instance backed by {@link KeyvRedis}. Namespace is applied on both
 * Keyv and the adapter so keys are prefixed once (`namespace::key` with the default separator).
 *
 * @param {KeyvRedisConnect} [connect] - URI, client/cluster/sentinel options, or an existing
 *   connection. Defaults to `"redis://localhost:6379"`.
 * @param {KeyvRedisOptions} [options] - Adapter options such as `namespace`, `keyPrefixSeparator`,
 *   `clearBatchSize`, `throwOnErrors`, and `connectionTimeout`.
 * @returns {Keyv} A Keyv instance using KeyvRedis as the store.
 * @example
 * ```ts
 * const keyv = createKeyv("redis://localhost:6379", { namespace: "cache" });
 * ```
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
 * Create a non-blocking Keyv instance with the Redis adapter. Same as {@link createKeyv}, then
 * disables throwing, the Redis offline queue, and reconnect so a secondary cache (for example
 * cacheable) does not block the primary cache on connection errors or timeouts.
 *
 * @param {KeyvRedisConnect} [connect] - URI, client/cluster/sentinel options, or an existing
 *   connection. Defaults to `"redis://localhost:6379"`.
 * @param {KeyvRedisOptions} [options] - Adapter options. `throwOnConnectError` and `throwOnErrors`
 *   are forced off on the returned instance.
 * @returns {Keyv} A non-blocking Keyv instance using KeyvRedis as the store.
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
