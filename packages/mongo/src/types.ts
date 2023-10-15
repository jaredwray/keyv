import {type Collection, type Db, type GridFSBucket, type ReadPreference} from 'mongodb';
import {type StoredData} from 'keyv';

export type Options = {
	[key: string]: unknown;
	url?: string | undefined;
	collection?: string;
	namespace?: string;
	serialize?: any;
	deserialize?: any;
	useGridFS?: boolean;
	uri?: string;
	dialect?: string;
	db?: string;
	readPreference?: ReadPreference;
};

export type KeyvMongoOptions = Options | string;

export type KeyvMongoConnect = {
	bucket?: GridFSBucket;
	store: Collection;
	db?: Db;
};

export type PifyFunction = (...args: any[]) => any;

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<StoredData<Value | undefined>[]>;

export type SetOutput = Promise<any>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type ClearExpiredOutput = Promise<boolean>;

export type ClearUnusedForOutput = Promise<boolean>;

export type HasOutput = Promise<boolean>;
