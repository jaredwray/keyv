'use strict';

const EventEmitter = require('events');
const Database = require('better-sqlite3');

class KeyvSqlite extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		options = Object.assign({
			dialect: 'sqlite',
			uri: 'sqlite://:memory:',
		}, options);
		options.db = options.uri.replace(/^sqlite:\/\//, '');

		this.opts = Object.assign({
			table: 'keyv',
			keySize: 255,
		}, options);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const dbOptions = {};
		if (options.busyTimeout) {
			dbOptions.timeout = options.busyTimeout;
		}

		try {
			this.db = new Database(options.db, dbOptions);
			this.db.prepare(createTable).run();
		} catch (error) {
			setImmediate(() => this.emit('error', error));
		}
	}

	get(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = ?`;
		const row = this.db.prepare(select).get(key);
		if (row === undefined) {
			return undefined;
		}

		return row.value;
	}

	set(key, value) {
		const upsert = `INSERT INTO ${this.opts.table} (key, value)
			VALUES(?, ?) 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.db.prepare(upsert).run(key, value);
	}

	delete(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = ?`;
		const del = `DELETE FROM ${this.opts.table} WHERE key = ?`;

		const row = this.db.prepare(select).get(key);
		if (row === undefined) {
			return false;
		}

		this.db.prepare(del).run(key);
		return true;
	}

	clear() {
		const del = `DELETE FROM ${this.opts.table} WHERE key LIKE ?`;
		this.db.prepare(del).run(`${this.namespace ? this.namespace + ':' : ''}%`);
		return undefined;
	}

	async * iterator(namespace) {
		const limit = Number.parseInt(this.opts.iterationLimit, 10) || 10;
		async function * iterate(offset, options, db) {
			const select = `SELECT * FROM ${options.table} WHERE key LIKE ? LIMIT ? OFFSET ?`;
			const iterator = db.prepare(select).iterate([`${namespace ? namespace + ':' : ''}%`, limit, offset]);
			const enteries = Array.from(iterator);
			if (enteries.length === 0) {
				return;
			}

			for (const entry of enteries) {
				offset += 1;
				yield [entry.key, entry.value];
			}

			if (offset !== 0) {
				yield * iterate(offset, options, db);
			}
		}

		yield * iterate(0, this.opts, this.db);
	}
}

module.exports = KeyvSqlite;
