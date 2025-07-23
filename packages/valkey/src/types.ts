import {type Redis, type RedisOptions, type Cluster} from 'iovalkey';

export type KeyvValkeyOptions = RedisOptions & {
	uri?: string;
	dialect?: string;
	useRedisSets?: boolean;
};

export type KeyvUriOptions = string | KeyvValkeyOptions | Redis | Cluster;
