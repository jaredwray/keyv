import {type Redis, type Cluster} from 'iovalkey';

export type KeyvValkeyOptions = {
	[K in keyof Redis]?: Redis[K];
} & {
	uri?: string;
	dialect?: string;
	useRedisSets?: boolean;
};

export type KeyvUriOptions = string | KeyvValkeyOptions | Redis | Cluster;
