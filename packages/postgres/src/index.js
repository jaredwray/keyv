'use strict';

const EventEmitter = require('events');
const {pool, endPool} = require('./pool.js');

class KeyvPostgres extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;
		options = {
			dialect: 'postgres',
			uri: 'postgresql://localhost:5432',
			...options,
		};

		this.opts = {
			table: 'keyv',
			schema: 'public',
			keySize: 255,
			...options,
		};

		this.connect();
	}

	async connect() {
		try {
			const conn = pool(this.opts.uri, this.opts);
			this.query = async (sql, values) => {
				const {rows} = await conn.query(sql, values);
				return rows;
			};

			let createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.schema}.${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

			if (this.opts.schema !== 'public') {
				createTable = `CREATE SCHEMA IF NOT EXISTS ${this.opts.schema}; ${createTable}`;
			}

			await this.query(createTable);
		} catch (error) {
			this.emit('error', error);
		}
	}

	async get(key) {
		const select = `SELECT * FROM ${this.opts.schema}.${this.opts.table} WHERE key = $1`;
		const rows = await this.query(select, [key]);
		const row = rows[0];
		return row === undefined ? undefined : row.value;
	}

	async getMany(keys) {
		const getMany = `SELECT * FROM ${this.opts.schema}.${this.opts.table} WHERE key = ANY($1)`;
		const rows = await this.query(getMany, [keys]);
		const results = [];

		for (const key of keys) {
			const rowIndex = rows.findIndex(row => row.key === key);
			results.push(rowIndex > -1 ? rows[rowIndex].value : undefined);
		}

		return results;
	}

	async set(key, value) {
		const upsert = `INSERT INTO ${this.opts.schema}.${this.opts.table} (key, value)
      VALUES($1, $2) 
      ON CONFLICT(key) 
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [key, value]);
	}

	async delete(key) {
		const select = `SELECT * FROM ${this.opts.schema}.${this.opts.table} WHERE key = $1`;
		const del = `DELETE FROM ${this.opts.schema}.${this.opts.table} WHERE key = $1`;
		const rows = await this.query(select, [key]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [key]);
		return true;
	}

	async deleteMany(keys) {
		const select = `SELECT * FROM ${this.opts.schema}.${this.opts.table} WHERE key = ANY($1)`;
		const del = `DELETE FROM ${this.opts.schema}.${this.opts.table} WHERE key = ANY($1)`;
		const rows = await this.query(select, [keys]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [keys]);
		return true;
	}

	async clear() {
		const del = `DELETE FROM ${this.opts.schema}.${this.opts.table} WHERE key LIKE $1`;
		await this.query(del, [this.namespace ? `${this.namespace}:%` : '%']);
	}

	async * iterator(namespace) {
		const limit = Number.parseInt(this.opts.iterationLimit, 10) || 10;
		async function * iterate(offset, options, query) {
			const select = `SELECT * FROM ${options.schema}.${options.table} WHERE key LIKE $1 LIMIT $2 OFFSET $3`;
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

	async has(key) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.schema}.${this.opts.table} WHERE key = $1 )`;
		const rows = await this.query(exists, [key]);
		return rows[0].exists;
	}

	disconnect() {
		return endPool();
	}
}

module.exports = KeyvPostgres;
