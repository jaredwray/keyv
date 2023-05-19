import type{StoredData} from 'keyv';
import type{Redis, Cluster} from 'ioredis';

export type KeyvOptions = {
	uri?: string;
	dialect?: string;
};

export type KeyvRedisOptions = KeyvOptions | Redis | Cluster;

export type KeyvUriOptions = string | Redis | Cluster;

export type IteratorOutput = AsyncGenerator<any, void, any>;

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<Array<StoredData<Value | undefined>>>;

export type SetOutput = Promise<any>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type HasOutput = Promise<boolean>;

export type DisconnectOutput = Promise<void>;
