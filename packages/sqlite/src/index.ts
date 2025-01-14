import EventEmitter from 'events';
import {promisify} from 'util';
import Keyv, {type KeyvStoreAdapter, type StoredData} from 'keyv';
import sqlite3 from 'sqlite3';
import {
	Row,
	type Db, type DbClose, type DbQuery, type KeyvSqliteOptions,
} from './types';

const toString = (input: string) => String(input).search(/^[a-zA-Z]+$/) < 0 ? '_' + input : input;

export class KeyvSqlite extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport: boolean;
	opts: KeyvSqliteOptions;
	namespace?: string;
	close: DbClose;
	query: DbQuery;

	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super();
		this.ttlSupport = true;
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

		options.db = options.uri!.replace(/^sqlite:\/\//, '');

		options.connect = async () => new Promise((resolve, reject) => {
			const database = new sqlite3.Database(options.db!, error => {
				/* c8 ignore next 2 */
				if (error) {
					reject(error);
				} else {
					if (options.busyTimeout) {
						database.configure('busyTimeout', options.busyTimeout);
					}

					resolve(database);
				}
			});
		})
			// @ts-expect-error - db is unknown
			.then(database => ({query: promisify(database.all).bind(database), close: promisify(database.close).bind(database)}));

		this.opts = {
			table: 'keyv',
			keySize: 255,
			...options,
		};

		this.opts.table = toString(this.opts.table!);

		const createTable = `
		CREATE TABLE IF NOT EXISTS ${this.opts.table} (
			key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY,
			value TEXT,
			expire INTEGER
		);
		CREATE INDEX IF NOT EXISTS index_expire_${this.opts.table} ON ${this.opts.table} (expire);
		`;

		// @ts-expect-error - db is
		const connected: Promise<DB> = this.opts.connect!()
			.then(async database => database.query(createTable).then(() => database as Db))
			.catch(error => this.emit('error', error));

		this.query = async (sqlString, ...parameter) => connected
			.then(async database => database.query(sqlString, ...parameter));

		this.close = async () => connected.then(database => database.close);
	}

	async get<Value>(key: string) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const now = Date.now();

		let rows: Row<Value>[] = await this.query(select, key)
		const fetchedNumber = rows.length;
		rows = rows.filter((row) => !row.expire || row.expire > now);

		// Schedule cleanup if some keys are expired
		if (fetchedNumber > rows.length) {
			process.nextTick(() => this.cleanExpired().catch((error) => this.emit('error', error)));
		}

		if (rows.length === 0) {
			return undefined;
		}

		return rows[0].value;
	}

	async getMany<Value>(keys: string[]) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;
		const now = Date.now();
		
		let rows: Row<Value>[] = await this.query(select, JSON.stringify(keys));
		const fetchedNumber = rows.length;
		rows = rows.filter((row) => !row.expire || row.expire > now);

		// Schedule cleanup if some keys are expired
		if (fetchedNumber > rows.length) {
			process.nextTick(() => this.cleanExpired().catch((error) => this.emit('error', error)));
		}

		const rowsMap = new Map(rows.map((row) => [row.key, row]));
		return keys.map(key => rowsMap.get(key)?.value);
	}

	async set(key: string, value: any, ttl?: number) {
		const upsert = `INSERT OR REPLACE INTO ${this.opts.table!} (key, value, expire) VALUES`;
		const expire = ttl ? Date.now() + ttl : null;
		await this.query(upsert, key, value, expire);
	}

	async delete(key: string) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const del = `DELETE FROM ${this.opts.table!} WHERE key = ?`;

		const rows: Row<any>[] = await this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return false;
		}

		await this.query(del, key);
		return true;
	}

	async deleteMany(keys: string[]) {
		const del = `DELETE FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;

		const results = await this.getMany(keys);
		if (results.every(x => x === undefined)) {
			return false;
		}

		await this.query(del, JSON.stringify(keys));
		return true;
	}

	async clear() {
		const del = `DELETE FROM ${this.opts.table!} WHERE key LIKE ?`;
		await this.query(del, this.namespace ? `${this.namespace}:%` : '%');
	}

	async * iterator(namespace?: string) {
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

	async has(key: string) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table!} WHERE key = ? )`;
		const result = await this.query(exists, key);
		return Object.values(result[0])[0] === 1;
	}

	async disconnect() {
		await this.close();
	}

	private async cleanExpired() {
		const del = `DELETE FROM ${this.opts.table!} WHERE expire IS NOT NULL AND expire < ?`;
		const now = Date.now();
		await this.query(del, now);
	}
}

export const createKeyv = (keyvOptions?: KeyvSqliteOptions | string) => new Keyv({store: new KeyvSqlite(keyvOptions)});

export default KeyvSqlite;
export type {KeyvSqliteOptions} from './types';
