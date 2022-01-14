'use strict';

const EventEmitter = require('events');
const Pool = require('pg').Pool;

class KeyvPostgres extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		options = Object.assign({
			dialect: 'postgres',
			uri: 'postgresql://localhost:5432',
		}, options);

		options.connect = () => Promise.resolve()
			.then(() => {
				const pool = new Pool({ connectionString: options.uri });
				return sql => pool.query(sql)
					.then(data => data.rows);
			});
		this.opts = Object.assign({
			table: 'keyv',
			keySize: 255,
		}, options);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const connected = this.opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(error => this.emit('error', error));

		this.query = sqlString => connected
			.then(query => query(sqlString));
	}

	get(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = '${key}'`;
		return this.query(select)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return undefined;
				}

				return row.value;
			});
	}

	set(key, value) {
		const upsert = `INSERT INTO ${this.opts.table} (key, value)
			VALUES('${key}', '${value}') 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.query(upsert);
	}

	delete(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE key = '${key}'`;
		const del = `DELETE FROM ${this.opts.table} WHERE key = '${key}'`;
		return this.query(select)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return false;
				}

				return this.query(del)
					.then(() => true);
			});
	}

	clear() {
		const del = `DELETE FROM ${this.opts.table} WHERE key LIKE '${this.namespace}:%'`;
		return this.query(del)
			.then(() => undefined);
	}
}

module.exports = KeyvPostgres;
