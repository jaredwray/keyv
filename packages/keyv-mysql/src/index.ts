import { KeyvStore } from 'keyv';
import KeyvSql from '@keyv/sql';
import mysql from 'mysql2/promise';

export interface KeyvMysqlOptions {
	uri?: string;
	table?: string;
	keySize?: number;
}

export default class KeyvMysql<TVal> extends KeyvSql<TVal> implements KeyvStore<TVal> {
	constructor(opts: string | KeyvMysqlOptions) {
		const normalizedOpts = {
			uri: 'mysql://localhost',
			...(typeof opts === 'string' ? { uri: opts } : opts)
		};

		super({
			dialect: 'mysql',

			async connect() {
				const connection = await mysql.createConnection(normalizedOpts.uri);
				return async (sql: string) => {
					const [row] = await connection.execute(sql);
					return row;
				};
			},

			...normalizedOpts
		});
	}
}

