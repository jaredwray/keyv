import type { Cluster, Redis, RedisOptions } from "iovalkey";

export type KeyvValkeyOptions = RedisOptions & {
	uri?: string;
	dialect?: string;
	useSets?: boolean;
};

export type KeyvUriOptions = string | KeyvValkeyOptions | Redis | Cluster;
