import { promisify as pify } from 'util';
import sqlite3 from 'sqlite3';
import { KeyvStore } from 'keyv';
import KeyvSql from '@keyv/sql';

export interface KeyvSqliteOptions {
	uri?: string;
	table?: string;
	busyTimeout?: number;
}

export default class KeyvSqlite<TVal> extends KeyvSql<TVal> implements KeyvStore<TVal> {
	constructor(opts: KeyvSqliteOptions) {
		const { uri = 'sqlite://:memory:' } = opts

		const dbName = uri.replace(/^sqlite:\/\//, '');

		super({
			dialect: 'sqlite',
			connect: () => new Promise((resolve, reject) => {
				const db = new sqlite3.Database(dbName, err => {
					if (err) {
						reject(err);
					} else {
						if (opts.busyTimeout) {
							db.configure('busyTimeout', opts.busyTimeout);
						}

						resolve(pify(db.all.bind(db)));
					}
				});
			}),
			...opts
		})
	}
}
