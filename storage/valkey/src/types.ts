import type { Cluster, Redis, RedisOptions } from "iovalkey";

export type KeyvValkeyOptions = RedisOptions & {
	/** Valkey connection URI such as `redis://localhost:6379`. */
	uri?: string;
	/** Whether to use Valkey sets for namespace key tracking. @default false */
	useSets?: boolean;
	/** Namespace used to prefix keys for multi-tenant isolation. @default undefined */
	namespace?: string;
};

export type KeyvUriOptions = string | KeyvValkeyOptions | Redis | Cluster;
