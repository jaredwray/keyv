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
