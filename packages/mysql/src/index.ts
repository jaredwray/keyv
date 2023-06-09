import EventEmitter from 'events';
import mysql from 'mysql2';
import {
	type ClearOutput,
	type DeleteManyOutput,
	type DeleteOutput, type DisconnectOutput,
	type GetManyOutput,
	type GetOutput, type HasOutput, type IteratorOutput,
	type KeyvMysqlOptions,
	type SetOutput,
} from './types';
import {endPool, pool} from './pool';

const keyvMysqlKeys = new Set(['adapter', 'compression', 'connect', 'dialect', 'keySize', 'table', 'ttl', 'uri']);

type QueryType<T> = Promise<T extends
mysql.RowDataPacket[][] |
mysql.RowDataPacket[] |
mysql.OkPacket |
mysql.OkPacket[] |
mysql.ResultSetHeader
	? T
	: never>;

class KeyvMysql<Value = any> extends EventEmitter {
	ttlSupport: boolean;
	opts: KeyvMysqlOptions;
	namespace?: string;
	query: <T>(sqlString: string) => QueryType<T>;
	constructor(keyvOptions?: KeyvMysqlOptions | string) {
		super();
		this.ttlSupport = false;

		let options: KeyvMysqlOptions = {
			dialect: 'mysql',
			uri: 'mysql://localhost',
		};

		if (typeof keyvOptions === 'string') {
			options.uri = keyvOptions;
		} else {
			options = {
				...options,
				...keyvOptions,
			};
		}

		const mysqlOptions = Object.fromEntries(
			Object.entries(options).filter(
				([k]) => !keyvMysqlKeys.has(k),
			),
		);

		delete mysqlOptions.namespace;
		delete mysqlOptions.serialize;
		delete mysqlOptions.deserialize;

		const connection = async () => Promise.resolve()
			.then(() => pool(options.uri!, mysqlOptions))
			.then(connection => async (sql: string) => connection.execute(sql)
				.then(data => data[0]));

		this.opts = {table: 'keyv',
			keySize: 255, ...options};

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table!}(id VARCHAR(${Number(this.opts.keySize!)}) PRIMARY KEY, value TEXT )`;

		const connected = connection()
			.then(async query => query(createTable).then(() => query))
			.catch(error => this.emit('error', error));

		this.query = async (sqlString: string) => connected
			.then(query =>
			// @ts-expect-error - query is not a boolean
				query(sqlString),
			);
	}

	async get(key: string): GetOutput<Value> {
		const sql = `SELECT * FROM ${this.opts.table!} WHERE id = ?`;
		const select = mysql.format(sql, [key]);

		const rows: mysql.RowDataPacket = await this.query(select);
		const row = rows[0];

		if (row === undefined) {
			return undefined;
		}

		return row?.value as Value;
	}

	async getMany(keys: string[]): GetManyOutput<Value> {
		const sql = `SELECT * FROM ${this.opts.table!} WHERE id IN (?)`;
		const select = mysql.format(sql, [keys]);

		const rows: mysql.RowDataPacket = await this.query(select);

		const results = [...keys];
		let i = 0;
		for (const key of keys) {
			const rowIndex = rows.findIndex((row: {id: string}) => row.id === key);
			results[i] = rowIndex > -1 ? rows[rowIndex].value : undefined;
			i++;
		}

		return results;
	}

	async set(key: string, value: Value): SetOutput {
		const sql = `INSERT INTO ${this.opts.table!} (id, value)
			VALUES(?, ?) 
			ON DUPLICATE KEY UPDATE value=?;`;
		const insert = [key, value, value];
		const upsert = mysql.format(sql, insert);
		return this.query(upsert);
	}

	async delete(key: string): DeleteOutput {
		const sql = `SELECT * FROM ${this.opts.table!} WHERE id = ?`;
		const select = mysql.format(sql, [key]);
		const delSql = `DELETE FROM ${this.opts.table!} WHERE id = ?`;
		const del = mysql.format(delSql, [key]);

		const rows: mysql.RowDataPacket = await this.query(select);
		const row = rows[0];

		if (row === undefined) {
			return false;
		}

		await this.query(del);
		return true;
	}

	async deleteMany(key: string): DeleteManyOutput {
		const sql = `DELETE FROM ${this.opts.table!} WHERE id IN (?)`;
		const del = mysql.format(sql, [key]);

		const result: mysql.ResultSetHeader = await this.query(del);
		return result.affectedRows !== 0;
	}

	async clear(): ClearOutput {
		const sql = `DELETE FROM ${this.opts.table!} WHERE id LIKE ?`;
		const del = mysql.format(sql, [this.namespace ? `${this.namespace}:%` : '%']);

		await this.query(del);
	}

	async * iterator(namespace?: string): IteratorOutput {
		const limit = Number.parseInt(this.opts.iterationLimit! as string, 10) || 10;
		// @ts-expect-error - iterate
		async function * iterate(offset: number, options: KeyvMysqlOptions, query: <T>(sqlString: string) => QueryType<T>) {
			const sql = `SELECT * FROM ${options.table!} WHERE id LIKE ? LIMIT ? OFFSET ?`;
			const select = mysql.format(sql, [`${namespace ? namespace + ':' : ''}%`, limit, offset]);
			const entries: mysql.RowDataPacket[] = await query(select);
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				offset += 1;
				yield [entry.id, entry.value];
			}

			yield * iterate(offset, options, query);
		}

		yield * iterate(0, this.opts, this.query);
	}

	async has(key: string): HasOutput {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table!} WHERE id = '${key}' )`;
		const rows = await this.query(exists);
		return Object.values(rows[0])[0] === 1;
	}

	async disconnect(): DisconnectOutput {
		endPool();
	}
}

export = KeyvMysql;
