import { KeyvStore } from 'keyv';
import KeyvSql from '@keyv/sql';
import { Pool } from 'pg';

export interface KeyvPostgresOptions {
	uri?: string;
	table?: string;
	keySize?: number;
}

export default class KeyvPostgres<TVal> extends KeyvSql<TVal> implements KeyvStore<TVal> {
	constructor(opts: KeyvPostgresOptions = {}) {
		const { uri = 'postgresql://localhost:5432' } = opts;

		super({
			dialect: 'postgres',

			async connect() {
				const pool = new Pool({ connectionString: uri });
				return Promise.resolve(
					async (sql: string) => {
						const { rows } = await pool.query(sql);
						return rows;
					}
				);
			},

			...opts
		});
	}
}
