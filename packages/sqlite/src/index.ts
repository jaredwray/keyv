// biome-ignore-all lint/style/noNonNullAssertion: need to fix
import EventEmitter from "node:events";
import { promisify } from "node:util";
import Keyv, { type KeyvStoreAdapter, type StoredData } from "keyv";
import sqlite3 from "sqlite3";
import type { Db, DbClose, DbQuery, KeyvSqliteOptions } from "./types.js";

const toTableString = (input: string) =>
	String(input).search(/^[a-zA-Z]+$/) < 0 ? `_${input}` : input;

export class KeyvSqlite extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport: boolean;
	opts: KeyvSqliteOptions;
	namespace?: string;
	close: DbClose;
	query: DbQuery;

	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super();
		this.ttlSupport = false;
		let options: KeyvSqliteOptions = {
			dialect: "sqlite",
			uri: "sqlite://:memory:",
		};

		if (typeof keyvOptions === "string") {
			options.uri = keyvOptions;
		} else {
			options = {
				...options,
				...keyvOptions,
			};
		}

		options.db = options.uri!.replace(/^sqlite:\/\//, "");

		options.connect = async () =>
			new Promise((resolve, reject) => {
				const database = new sqlite3.Database(options.db!, (error) => {
					/* c8 ignore next 2 */
					if (error) {
						reject(error);
					} else {
						if (options.busyTimeout) {
							database.configure("busyTimeout", options.busyTimeout);
						}

						resolve(database);
					}
				});
			}).then((database) => ({
				// @ts-expect-error
				query: promisify(database.all).bind(database),
				// @ts-expect-error
				close: promisify(database.close).bind(database),
			}));

		this.opts = {
			table: "keyv",
			keySize: 255,
			...options,
		};

		this.opts.table = toTableString(this.opts.table!);

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.opts.table}(key VARCHAR(${Number(this.opts.keySize)}) PRIMARY KEY, value TEXT )`;

		// @ts-expect-error - db is
		const connected: Promise<DB> = this.opts.connect!()
			.then(async (database) =>
				database.query(createTable).then(() => database as Db),
			)
			.catch((error) => this.emit("error", error));

		this.query = async (sqlString, ...parameter) =>
			connected.then(async (database) =>
				database.query(sqlString, ...parameter),
			);

		this.close = async () => connected.then((database) => database.close());
	}

	async get<Value>(key: string) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key = ?`;
		const rows = await this.query(select, key);
		const row = rows[0];
		if (row === undefined) {
			return undefined;
		}

		return row.value as Value;
	}

	async getMany<Value>(keys: string[]) {
		const select = `SELECT * FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;
		const rows = await this.query(select, JSON.stringify(keys));

		return keys.map((key) => {
			const row = rows.find(
				(row: { key: string; value: Value }) => row.key === key,
			);
			return (row ? row.value : undefined) as StoredData<Value | undefined>;
		});
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any) {
		const upsert = `INSERT INTO ${this.opts.table!} (key, value)
			VALUES(?, ?) 
			ON CONFLICT(key) 
			DO UPDATE SET value=excluded.value;`;
		return this.query(upsert, key, value);
	}

	async delete(key: string) {
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

	async deleteMany(keys: string[]) {
		const del = `DELETE FROM ${this.opts.table!} WHERE key IN (SELECT value FROM json_each(?))`;

		const results = await this.getMany(keys);
		if (results.every((x) => x === undefined)) {
			return false;
		}

		await this.query(del, JSON.stringify(keys));
		return true;
	}

	async clear() {
		const del = `DELETE FROM ${this.opts.table!} WHERE key LIKE ?`;
		await this.query(del, this.namespace ? `${this.namespace}:%` : "%");
	}

	async *iterator(namespace?: string) {
		const limit =
			Number.parseInt(this.opts.iterationLimit! as string, 10) || 10;

		// @ts-expect-error - iterate
		async function* iterate(
			offset: number,
			options: KeyvSqliteOptions,
			// biome-ignore lint/suspicious/noExplicitAny: type format
			query: any,
		) {
			const select = `SELECT * FROM ${options.table!} WHERE key LIKE ? LIMIT ? OFFSET ?`;
			const iterator = await query(select, [
				// biome-ignore lint/style/useTemplate: need to fix
				`${namespace ? namespace + ":" : ""}%`,
				limit,
				offset,
			]);
			const entries = [...iterator];
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				offset += 1;
				yield [entry.key, entry.value];
			}

			yield* iterate(offset, options, query);
		}

		yield* iterate(0, this.opts, this.query);
	}

	async has(key: string) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.table!} WHERE key = ? )`;
		const result = await this.query(exists, key);
		return Object.values(result[0])[0] === 1;
	}

	async disconnect() {
		await this.close();
	}
}

export const createKeyv = (keyvOptions?: KeyvSqliteOptions | string) =>
	new Keyv({ store: new KeyvSqlite(keyvOptions) });

export default KeyvSqlite;
export type { KeyvSqliteOptions } from "./types";
