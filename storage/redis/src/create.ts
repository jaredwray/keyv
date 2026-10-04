import type { RedisClientOptions } from "@redis/client";
import { Keyv, type KeyvAny } from "keyv";
import KeyvRedis from "./index.js";
import type { KeyvRedisConnect, KeyvRedisOptions } from "./types.js";

/**
 * Create a Keyv instance backed by {@link KeyvRedis}. Namespace is applied on both
 * Keyv and the adapter so keys are prefixed once (`namespace::key` with the default separator).
 *
 * @param {KeyvRedisConnect} [connect] - URI, client/cluster/sentinel options, or an existing
 *   connection. Defaults to `"redis://localhost:6379"`.
 * @param {KeyvRedisOptions} [options] - Adapter options such as `namespace`, `namespaceSeparator`,
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
	return new Keyv({
		store: adapter,
		namespace: adapter.namespace,
	});
}

/**
 * Create a non-blocking Keyv instance with the Redis adapter. Same as {@link createKeyv}, then
 * turns off the adapter's `throwOnConnectError` and `throwOnErrors`, the Redis offline queue, and
 * reconnect so a secondary cache (for example cacheable) does not block the primary cache on
 * connection errors or timeouts. As with any Keyv instance, attach an `error` listener so a failed
 * operation returns a fallback value instead of rejecting.
 *
 * Reconnect is turned off for a standalone client created from a URI or client options. A client
 * passed in keeps its own reconnect strategy, which node-redis fixes when the client is created,
 * so create it with `socket: { reconnectStrategy: false }`; its offline queue is still turned off.
 * Cluster and sentinel connections keep their own offline queue and reconnect settings.
 *
 * @param {KeyvRedisConnect} [connect] - URI, client/cluster/sentinel options, or an existing
 *   connection. Defaults to `"redis://localhost:6379"`.
 * @param {KeyvRedisOptions} [options] - Adapter options. `throwOnConnectError` and `throwOnErrors`
 *   are forced off on the returned instance's adapter.
 * @returns {Keyv} A non-blocking Keyv instance using KeyvRedis as the store.
 */
export function createKeyvNonBlocking(
	connect?: KeyvRedisConnect,
	options?: KeyvRedisOptions,
): Keyv {
	const keyv = createKeyv(nonBlockingConnect(connect), options);

	const keyvStore = keyv.store as KeyvRedis<KeyvAny>;

	keyvStore.throwOnConnectError = false;
	keyvStore.throwOnErrors = false;

	return keyv;
}

/**
 * Turn off the offline queue and reconnect for a standalone client. node-redis reads the reconnect
 * strategy only when it creates a client, so for a URI or client options both settings go into the
 * options the adapter creates the client from. A client passed in only has its offline queue turned
 * off, which node-redis checks on every command. Cluster and sentinel connections are unchanged.
 * @param {KeyvRedisConnect} [connect] - The `connect` argument given to {@link createKeyvNonBlocking}.
 * @returns {KeyvRedisConnect} The connect argument to create the adapter with.
 */
function nonBlockingConnect(connect?: KeyvRedisConnect): KeyvRedisConnect {
	if (connect === undefined || typeof connect === "string") {
		return {
			url: connect ?? "redis://localhost:6379",
			disableOfflineQueue: true,
			socket: { reconnectStrategy: false },
		};
	}

	const value = connect as KeyvAny;
	if (value.connect !== undefined) {
		// An existing connection. Only a standalone client has `options`.
		if (value.options) {
			value.options.disableOfflineQueue = true;
		}

		return connect;
	}

	if (value.rootNodes !== undefined || value.sentinelRootNodes !== undefined) {
		return connect;
	}

	const clientOptions = connect as RedisClientOptions;
	return {
		...clientOptions,
		disableOfflineQueue: true,
		socket: { ...clientOptions.socket, reconnectStrategy: false },
	};
}
