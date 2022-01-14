'use strict';

const EventEmitter = require('events');
const mysql = require('mysql2/promise');

class KeyvMysql extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		if (typeof options === 'string') {
			options = { uri: options };
		}

		options = Object.assign({
			dialect: 'mysql',
			uri: 'mysql://localhost',
		}, options);

		options.connect = () => Promise.resolve()
			.then(() => mysql.createConnection(options.uri))
			.then(connection => sql => connection.execute(sql)
				.then(data => data[0]));

		this.opts = Object.assign({
			table: 'keyv',
			keySize: 255,
		}, options);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(id VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const connected = this.opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(error => this.emit('error', error));

		this.query = sqlString => connected
			.then(query => query(sqlString));
	}

	get(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE id = '${key}'`;
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
		const sql = `INSERT INTO ${this.opts.table} (id, value)
			VALUES(?, ?) 
			ON DUPLICATE KEY UPDATE value=?;`;
		const insert = [key, value, value];
		const upsert = mysql.format(sql, insert);
		return this.query(upsert);
	}

	delete(key) {
		const select = `SELECT * FROM ${this.opts.table} WHERE id = '${key}'`;
		const del = `DELETE FROM ${this.opts.table} WHERE id = '${key}'`;
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
		const del = `DELETE FROM ${this.opts.table} WHERE id LIKE '${this.namespace}:%'`;
		return this.query(del)
			.then(() => undefined);
	}
}

module.exports = KeyvMysql;
