import {type StoredData} from 'keyv';
import {type ConnectionOptions} from 'mysql2';

export type KeyvMysqlOptions = {
	dialect?: 'mysql';
	uri?: string;
	table?: string;
	keySize?: number;
	iterationLimit?: number;
} & ConnectionOptions;

export type IteratorOutput = AsyncGenerator<any, void, any>;

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<Array<StoredData<Value | undefined>>>;

export type SetOutput = Promise<any>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type HasOutput = Promise<boolean>;

export type DisconnectOutput = Promise<void>;
