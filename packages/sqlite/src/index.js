'use strict';

const EventEmitter = require('events');
const sqlite3 = require('sqlite3');
const pify = require('pify');

const toString = input => String(input).search(/^[a-zA-Z]+$/) < 0 ? '_' + input : input;

class KeyvSqlite extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		options = {dialect: 'sqlite',
			uri: 'sqlite://:memory:', ...options};
		options.db = options.uri.replace(/^sqlite:\/\//, '');
		this.close = {};
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
			.then(db => ({query: pify(db.all).bind(db), close: pify(db.close).bind(db)}));

		this.opts = {table: 'keyv',
			keySize: 255, ...options};

		this.opts.table = toString(this.opts.table);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const connected = this.opts.connect()
			.then(db => db.query(createTable).then(() => db))
			.catch(error => this.emit('error', error));

		this.query = (sqlString, ...parameter) => connected
			.then(db => db.query(sqlString, ...parameter));

		this.close = () => connected.then(db => db.close);
	}

	get(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = ?`;
		return this.query(select, key)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return undefined;
				}

				return row.value;
			});
	}

	getMany(keys) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key IN (SELECT value FROM json_each(?))`;
		return this.query(select, JSON.stringify(keys)).then(rows => {
			const results = [...keys];
			let i = 0;
			for (const key of keys) {
				const rowIndex = rows.findIndex(row => row.key === key);

				if (rowIndex > -1) {
					results[i] = rows[rowIndex].value;
				} else {
					results[i] = undefined;
				}

				i++;
			}

			return results;
		});
	}

	set(key, value) {
		const upsert = `INSERT INTO ${this.opts.table} (key, value)
			VALUES(?, ?) 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.query(upsert, key, value);
	}

	delete(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = ?`;
		const del = `DELETE FROM ${this.opts.table} WHERE key = ?`;

		return this.query(select, key)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return false;
				}

				return this.query(del, key)
					.then(() => true);
			});
	}

	deleteMany(keys) {
		const del = `DELETE FROM ${this.opts.table} WHERE key IN (SELECT value FROM json_each(?))`;
		return this.getMany(keys).then(results => {
			if (results.every(x => x === undefined) === true) {
				return false;
			}

			return this.query(del, JSON.stringify(keys)).then(() => true);
		});
	}

	clear() {
		const del = `DELETE FROM ${this.opts.table} WHERE key LIKE ?`;
		return this.query(del, this.namespace ? `${this.namespace}:%` : '%')
			.then(() => undefined);
	}

	async * iterator(namespace) {
		const limit = Number.parseInt(this.opts.iterationLimit, 10) || 10;
		async function * iterate(offset, options, query) {
			const select = `SELECT * FROM ${options.table} WHERE key LIKE ? LIMIT ? OFFSET ?`;
			const iterator = await query(select, [`${namespace ? namespace + ':' : ''}%`, limit, offset]);
			const enteries = [...iterator];
			if (enteries.length === 0) {
				return;
			}

			for (const entry of enteries) {
				offset += 1;
				yield [entry.key, entry.value];
			}

			yield * iterate(offset, options, query);
		}

		yield * iterate(0, this.opts, this.query);
	}

	has(key) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table} WHERE key = ? )`;
		return this.query(exists, key).then(result => Object.values(result[0])[0] === 1);
	}

	disconnect() {
		return this.close().then(() => undefined);
	}
}

module.exports = KeyvSqlite;
