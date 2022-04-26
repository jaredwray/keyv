'use strict';

const EventEmitter = require('events');
const {pool} = require('./pool.js');

class KeyvPostgres extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		options = {dialect: 'postgres',
			uri: 'postgresql://localhost:5432', ...options};

		options.connect = () => Promise.resolve()
			.then(() => {
				const conn = pool(options.uri);
				return (sql, values) => conn.query(sql, values)
					.then(data => data.rows);
			});
		this.opts = {table: 'keyv',
			keySize: 255, ...options};

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const connected = this.opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(error => this.emit('error', error));

		this.query = (sqlString, values) => connected
			.then(query => query(sqlString, values));
	}

	get(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = $1`;
		return this.query(select, [key])
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return undefined;
				}

				return row.value;
			});
	}

	getMany(keys) {
		const getMany = `SELECT * FROM ${this.opts.table} WHERE key = ANY($1)`;
		return this.query(getMany, [keys]).then(rows => {
			if (rows.length === 0) {
				return [];
			}

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
			VALUES($1, $2) 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.query(upsert, [key, value]);
	}

	delete(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = $1`;
		const del = `DELETE FROM ${this.opts.table} WHERE key = $1`;
		return this.query(select, [key])
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return false;
				}

				return this.query(del, [key])
					.then(() => true);
			});
	}

	deleteMany(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = ANY($1)`;
		const del = `DELETE FROM ${this.opts.table} WHERE key = ANY($1)`;
		return this.query(select, [key])
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return false;
				}

				return this.query(del, [key])
					.then(() => true);
			});
	}

	clear() {
		const del = `DELETE FROM ${this.opts.table} WHERE key LIKE $1`;
		return this.query(del, [this.namespace ? `${this.namespace}:%` : '%'])
			.then(() => undefined);
	}

	async * iterator(namespace) {
		const limit = Number.parseInt(this.opts.iterationLimit, 10) || 10;
		async function * iterate(offset, options, query) {
			const select = `SELECT * FROM ${options.table} WHERE key LIKE $1 LIMIT $2 OFFSET $3`;
			const enteries = await query(select, [`${namespace ? namespace + ':' : ''}%`, limit, offset]);
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
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table} WHERE key = '${key}' )`;
		return this.query(exists).then(rows => rows[0].exists);
	}
}

module.exports = KeyvPostgres;
