'use strict';

const EventEmitter = require('events');
const mysql = require('mysql2/promise');
const {pool} = require('./pool.js');

class KeyvMysql extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		if (typeof options === 'string') {
			options = {uri: options};
		}

		options = {dialect: 'mysql',
			uri: 'mysql://localhost', ...options};

		options.connect = () => Promise.resolve()
			.then(() => pool(options.uri))
			.then(connection => sql => connection.execute(sql)
				.then(data => data[0]));

		this.opts = {table: 'keyv',
			keySize: 255, ...options};

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(id VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const connected = this.opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(error => this.emit('error', error));

		this.query = sqlString => connected
			.then(query => query(sqlString));
	}

	get(key) {
		const sql = `SELECT * FROM ${this.opts.table} WHERE id = ?`;
		const select = mysql.format(sql, [key]);
		return this.query(select)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return undefined;
				}

				return row.value;
			});
	}

	getMany(keys) {
		const sql = `SELECT * FROM ${this.opts.table} WHERE id IN (?)`;
		const select = mysql.format(sql, [keys]);
		return this.query(select).then(rows => {
			if (rows.length === 0) {
				return [];
			}

			const results = [...keys];
			let i = 0;
			for (const key of keys) {
				const rowIndex = rows.findIndex(row => row.id === key);

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
		const sql = `INSERT INTO ${this.opts.table} (id, value)
			VALUES(?, ?) 
			ON DUPLICATE KEY UPDATE value=?;`;
		const insert = [key, value, value];
		const upsert = mysql.format(sql, insert);
		return this.query(upsert);
	}

	delete(key) {
		const sql = `SELECT * FROM ${this.opts.table} WHERE id = ?`;
		const select = mysql.format(sql, [key]);
		const delSql = `DELETE FROM ${this.opts.table} WHERE id = ?`;
		const del = mysql.format(delSql, [key]);
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

	deleteMany(key) {
		const sql = `DELETE FROM ${this.opts.table} WHERE id IN (?)`;
		const del = mysql.format(sql, [key]);
		return this.query(del)
			.then(row => row.affectedRows !== 0);
	}

	clear() {
		const sql = `DELETE FROM ${this.opts.table} WHERE id LIKE ?`;
		const del = mysql.format(sql, [this.namespace ? `${this.namespace}:%` : '%']);
		return this.query(del)
			.then(() => undefined);
	}

	async * iterator(namespace) {
		const limit = Number.parseInt(this.opts.iterationLimit, 10) || 10;
		async function * iterate(offset, options, query) {
			const sql = `SELECT * FROM ${options.table} WHERE id LIKE ? LIMIT ? OFFSET ?`;
			const select = mysql.format(sql, [`${namespace ? namespace + ':' : ''}%`, limit, offset]);
			const enteries = await query(select);
			if (enteries.length === 0) {
				return;
			}

			for (const entry of enteries) {
				offset += 1;
				yield [entry.id, entry.value];
			}

			if (offset !== 0) {
				yield * iterate(offset, options, query);
			}
		}

		yield * iterate(0, this.opts, this.query);
	}

	has(key) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table} WHERE id = '${key}' )`;
		return this.query(exists).then(rows => Object.values(rows[0])[0] === 1);
	}
}

module.exports = KeyvMysql;
