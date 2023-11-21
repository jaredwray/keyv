import {type Redis, type Cluster} from 'ioredis';

export type KeyvRedisOptions = {
	[K in keyof Redis]?: Redis[K];
} & {
	uri?: string;
	dialect?: string;
	useRedisSets?: boolean;
};

export type KeyvUriOptions = string | KeyvRedisOptions | Redis | Cluster;
