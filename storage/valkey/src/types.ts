import type { Cluster, Redis, RedisOptions } from "iovalkey";

export type KeyvValkeyOptions = RedisOptions & {
	uri?: string;
	useSets?: boolean;
};

export type KeyvUriOptions = string | KeyvValkeyOptions | Redis | Cluster;
