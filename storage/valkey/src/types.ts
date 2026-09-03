import type { Cluster, Redis, RedisOptions } from "iovalkey";

/**
 * Configuration options for the {@link KeyvValkey} adapter. Extends iovalkey
 * {@link RedisOptions} so any client connection setting can be passed through.
 */
export type KeyvValkeyOptions = RedisOptions & {
	/**
	 * Valkey connection URI such as `redis://localhost:6379` or `valkey://localhost:6379`.
	 * @default undefined
	 */
	uri?: string;
	/**
	 * Whether to use Valkey sets for namespace key tracking. When `true`, a set is
	 * maintained per namespace so `clear()` can remove keys without scanning.
	 * @default false
	 */
	useSets?: boolean;
	/**
	 * Namespace used to prefix keys for multi-tenant isolation.
	 * @default undefined
	 */
	namespace?: string;
};

/**
 * Values accepted as the first argument to the {@link KeyvValkey} constructor:
 * a connection URI string, an options object, or an existing iovalkey `Redis` / `Cluster` instance.
 */
export type KeyvUriOptions = string | KeyvValkeyOptions | Redis | Cluster;
