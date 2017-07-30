import test from 'ava';
import keyvTestSuite from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvSql from 'this';

import sqlite3 from 'sqlite3';
import pify from 'pify';

class TestSqlite extends KeyvSql {
	constructor() {
		const opts = {
			dialect: 'sqlite',
			db: 'test/testdb.sqlite'
		};

		opts.connect = () => new Promise((resolve, reject) => {
			const db = new sqlite3.Database(opts.db, err => {
				if (err) {
					reject(err);
				} else {
					resolve(db);
				}
			});
		})
		.then(db => pify(db.all).bind(db));

		super(opts);
	}
}

const store = () => new TestSqlite();
keyvTestSuite(test, Keyv, store);
