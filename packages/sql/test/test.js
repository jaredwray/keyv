const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const Keyv = require('keyv');
const KeyvSql = require('this');
const sqlite3 = require('sqlite3');
const pify = require('pify');
const KeyvMysql = require('@keyv/mysql');

class TestSqlite extends KeyvSql {
	constructor(options) {
		options = Object.assign({
			dialect: 'sqlite',
			db: 'test/testdb.sqlite',
		}, options);

		options.connect = () => new Promise((resolve, reject) => {
			const db = new sqlite3.Database(options.db, error => {
				if (error) {
					reject(error);
				} else {
					db.configure('busyTimeout', 3000);
					resolve(db);
				}
			});
		})
			.then(db => pify(db.all).bind(db));

		super(options);
	}
}

const store = () => new TestSqlite();
keyvTestSuite(test, Keyv, store);

test('Default key data type is VARCHAR(255)', t => {
	const store = new TestSqlite();
	t.is(store.entry.key.dataType, 'VARCHAR(255)');
});

test('Do replacement if it is mysql', async t => {
	const store = new KeyvMysql('mysql://root@localhost/keyv_test');
	const options = {
		store,
		dialect: 'mysql',
	};
	const keyv = new Keyv(options);
	t.is(await keyv.set('foo', 'bar'), true);
	t.is(await keyv.get('foo'), 'bar');
});

test('keySize option overrides default', t => {
	const store = new TestSqlite({ keySize: 100 });
	t.is(store.entry.key.dataType, 'VARCHAR(100)');
});
