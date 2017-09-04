import test from 'ava';
import keyvTestSuite from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvSql from 'this';

import sqlite3 from 'sqlite3';
import pify from 'pify';

class TestSqlite extends KeyvSql {
	constructor(opts) {
		opts = Object.assign({
			dialect: 'sqlite',
			db: 'test/testdb.sqlite'
		}, opts);

		opts.connect = () => new Promise((resolve, reject) => {
			const db = new sqlite3.Database(opts.db, err => {
				if (err) {
					reject(err);
				} else {
					db.configure('busyTimeout', 30000);
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

test('Default key data type is VARCHAR(255)', t => {
	const store = new TestSqlite();
	t.is(store.entry.key.dataType, 'VARCHAR(255)');
});

test('keySize option overrides default', t => {
	const store = new TestSqlite({ keySize: 100 });
	t.is(store.entry.key.dataType, 'VARCHAR(100)');
});
