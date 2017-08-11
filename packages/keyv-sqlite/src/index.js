'use strict';

const KeyvSql = require('@keyv/sql');
const sqlite3 = require('sqlite3');
const pify = require('pify');

class KeyvSqlite extends KeyvSql {
	constructor(opts) {
		opts = Object.assign({
			dialect: 'sqlite',
			uri: 'sqlite://:memory:'
		}, opts);
		opts.db = opts.uri.replace(/^sqlite:\/\//, '');

		opts.connect = () => new Promise((resolve, reject) => {
			const db = new sqlite3.Database(opts.db, err => {
				if (err) {
					reject(err);
				} else {
					if (opts.busyTimeout) {
						db.configure('busyTimeout', opts.busyTimeout);
					}
					resolve(db);
				}
			});
		})
		.then(db => pify(db.all).bind(db));

		super(opts);
	}
}

module.exports = KeyvSqlite;
