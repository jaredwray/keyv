'use strict';

const KeyvSql = require('@keyv/sql');
const sqlite3 = require('sqlite3');
const pify = require('pify');

class KeyvSqlite extends KeyvSql {
	constructor(options) {
		options = Object.assign({
			dialect: 'sqlite',
			uri: 'sqlite://:memory:',
		}, options);
		options.db = options.uri.replace(/^sqlite:\/\//, '');

		options.connect = () => new Promise((resolve, reject) => {
			const db = new sqlite3.Database(options.db, error => {
				if (error) {
					reject(error);
				} else {
					if (options.busyTimeout) {
						db.configure('busyTimeout', options.busyTimeout);
					}

					resolve(db);
				}
			});
		})
			.then(db => pify(db.all).bind(db));

		super(options);
	}
}

module.exports = KeyvSqlite;
