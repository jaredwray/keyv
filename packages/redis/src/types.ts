import type{StoredData} from 'keyv';
import {type Cluster} from 'ioredis';
import type Redis from 'ioredis';

export type KeyvRedisOptions = {
	[K in keyof Redis]?: Redis[K];
} & {
	uri?: string;
	dialect?: string;
	useRedisSets?: boolean;
};

export type KeyvUriOptions = string | KeyvRedisOptions | Redis | Cluster;

export type IteratorOutput = AsyncGenerator<any, void, any>;

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<Array<StoredData<Value | undefined>>>;

export type SetOutput = Promise<any>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type HasOutput = Promise<boolean>;

export type DisconnectOutput = Promise<void>;
