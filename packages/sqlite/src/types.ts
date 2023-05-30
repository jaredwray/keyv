import type {StoredData} from 'keyv';

export type DbQuery = (sqlString: string, ...parameter: unknown[]) => Promise<any>;
export type DbClose = () => Promise<void>;

export type KeyvSqliteOptions = {
	dialect?: string;
	uri?: string;
	busyTimeout?: number;
	table?: string;
	keySize?: number;
	db?: string;
	iterationLimit?: number | string;
	connect?: () => Promise<
	{
		query: DbQuery;
		close: DbClose;
	}>;
};

export type Db = {
	query: DbQuery;
	close: DbClose;
};

export type IteratorOutput = AsyncGenerator<any, void, any>;

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<Array<StoredData<Value | undefined>>>;

export type SetOutput = Promise<any>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type HasOutput = Promise<boolean>;

export type DisconnectOutput = Promise<void>;
