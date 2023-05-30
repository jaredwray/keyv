import EventEmitter from 'events';
import sqlite3 from 'sqlite3';
import pify from 'pify';
import {
	type ClearOutput,
	type DeleteManyOutput,
	type DeleteOutput,
	type DisconnectOutput,
	type GetManyOutput,
	type GetOutput,
	type HasOutput, type IteratorOutput, type KeyvSqliteOptions,
	type SetOutput,
} from './types';

const toString = (input: string) => String(input).search(/^[a-zA-Z]+$/) < 0 ? '_' + input : input;

class KeyvSqlite<Value = any> extends EventEmitter {
	ttlSupport: boolean;
	opts: KeyvSqliteOptions;
	namespace?: string;
	close: () => Promise<void>;
	query: (sqlString: string, ...parameter: unknown[]) => Promise<any>;

	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super();
		this.ttlSupport = false;

		let options: KeyvSqliteOptions = {
			dialect: 'sqlite',
			uri: 'sqlite://:memory:',
		};

		if (typeof keyvOptions === 'string') {
			options.uri = keyvOptions;
		} else {
			options = {
				...options,
				...keyvOptions,
			};
		}

		options.db = options.uri?.replace(/^sqlite:\/\//, '');

		options.connect = async () => {
			try {
				const db = new sqlite3.Database(options.db!);
				db.on('error', error => {
					throw error;
				});
				if (options.busyTimeout) {
					db.configure('busyTimeout', options.busyTimeout);
				}

				return {query: pify(db.all).bind(db), close: pify(db.close).bind(db)};
			} catch (error) {
				this.emit('error', error);
				throw error;
			}
		};

		this.opts = {
			table: 'keyv',
			keySize: 255,
			...options,
		};

		this.opts.table = toString(this.opts.table!);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		const connected = async () => {
			try {
				const db = await options.connect!();
				await db.query(createTable);
				return db;
			} catch (error) {
				this.emit('error', error);
			}
		};

		this.query = async (sqlString, ...parameter) => {
			const db = await connected();
			return db!.query(sqlString, ...parameter);
		};

		this.close = async () => {
			const db = await connected();
			return db!.close();
		};
	}

	async get(key: string): GetOutput<Value> {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const rows = await this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return undefined;
		}

		return row.value as Value;
	}

	async getMany(keys: string[]): GetManyOutput<Value> {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;
		const rows = await this.query(select, JSON.stringify(keys));
		const results = [...keys];
		let i = 0;
		for (const key of keys) {
			const rowIndex = rows.findIndex((row: {key: string; value: Value}) => row.key === key);
			results[i] = rowIndex > -1 ? rows[rowIndex].value : undefined;
			i++;
		}

		return results;
	}

	async set(key: string, value: Value): SetOutput {
		const upsert = `INSERT INTO ${this.opts.table!} (key, value)
			VALUES(?, ?) 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.query(upsert, key, value);
	}

	async delete(key: string): DeleteOutput {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const del = `DELETE FROM ${this.opts.table!} WHERE key = ?`;

		const rows = await this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return false;
		}

		await this.query(del, key);
		return true;
	}

	async deleteMany(keys: string[]): DeleteManyOutput {
		const del = `DELETE FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;

		const results = await this.getMany(keys);
		if (results.every(x => x === undefined)) {
			return false;
		}

		await this.query(del, JSON.stringify(keys));
		return true;
	}

	async clear(): ClearOutput {
		const del = `DELETE FROM ${this.opts.table!} WHERE key LIKE ?`;
		await this.query(del, this.namespace ? `${this.namespace}:%` : '%');
	}

	async * iterator(namespace?: string): IteratorOutput {
		const limit = Number.parseInt(this.opts.iterationLimit! as string, 10) || 10;

		// @ts-expect-error - iterate
		async function * iterate(offset: number, options: KeyvSqliteOptions, query: any) {
			const select = `SELECT * FROM ${options.table!} WHERE key LIKE ? LIMIT ? OFFSET ?`;
			const iterator = await query(select, [`${namespace ? namespace + ':' : ''}%`, limit, offset]);
			const entries = [...iterator];
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				offset += 1;
				yield [entry.key, entry.value];
			}

			yield * iterate(offset, options, query);
		}

		yield * iterate(0, this.opts, this.query);
	}

	async has(key: string): HasOutput {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table!} WHERE key = ? )`;
		const result = await this.query(exists, key);
		return Object.values(result[0])[0] === 1;
	}

	async disconnect(): DisconnectOutput {
		await this.close();
	}
}

export = KeyvSqlite;
