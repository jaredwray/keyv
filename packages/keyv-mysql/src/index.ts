import { KeyvStore } from 'keyv';
import KeyvSql from '@keyv/sql';
import mysql from 'mysql2/promise';

export interface KeyvMysqlOptions {
	uri?: string;
	table?: string;
	keySize?: number;
}

export default class KeyvMysql<TVal> extends KeyvSql<TVal> implements KeyvStore<TVal> {
	constructor(uriOrOpts: string | KeyvMysqlOptions) {
		const opts = {
			uri: 'mysql://localhost',
			...(typeof uriOrOpts === 'string' ? { uri: uriOrOpts } : uriOrOpts)
		};

		super({
			dialect: 'mysql',

			async connect() {
				const connection = await mysql.createConnection(opts.uri);
				return async (sql: string) => {
					const [row] = await connection.execute(sql);
					return row;
				};
			},

			...opts
		});
	}
}

