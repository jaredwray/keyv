// biome-ignore-all lint/style/noNonNullAssertion: need to fix
import EventEmitter from "node:events";
import Keyv, { type KeyvEntry, type KeyvStoreAdapter } from "keyv";
import type { DatabaseError } from "pg";
import { endPool, pool } from "./pool.js";
import type { KeyvPostgresOptions, Query } from "./types.js";

export class KeyvPostgres extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport: boolean;
	opts: KeyvPostgresOptions;
	query: Query;
	namespace?: string;
	constructor(options?: KeyvPostgresOptions | string) {
		super();
		this.ttlSupport = false;

		if (typeof options === "string") {
			const uri = options;
			options = {
				dialect: "postgres",
				uri,
			};
		} else {
			options = {
				dialect: "postgres",
				uri: "postgresql://localhost:5432",
				...options,
			};
		}

		this.opts = {
			table: "keyv",
			schema: "public",
			keySize: 255,
			...options,
		};

		let createTable = `CREATE${this.opts.useUnloggedTable ? " UNLOGGED " : " "}TABLE IF NOT EXISTS ${this.opts.schema!}.${this.opts.table!}(key VARCHAR(${Number(this.opts.keySize!)}) PRIMARY KEY, value TEXT )`;

		if (this.opts.schema !== "public") {
			createTable = `CREATE SCHEMA IF NOT EXISTS ${this.opts.schema!}; ${createTable}`;
		}

		const connected = this.connect()
			.then(async (query) => {
				try {
					await query(createTable);
				} catch (error) {
					if ((error as DatabaseError).code !== "23505") {
						this.emit("error", error);
					}

					/* v8 ignore next -- @preserve */
					return query;
				}

				return query;
			})
			.catch((error) => this.emit("error", error));

		// biome-ignore lint/suspicious/noExplicitAny: type format
		this.query = async (sqlString: string, values?: any) =>
			connected
				// @ts-expect-error - query is not a boolean
				.then((query) => query(sqlString, values));
	}

	async get(key: string) {
		const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1`;
		const rows = await this.query(select, [key]);
		const row = rows[0];
		return row === undefined ? undefined : row.value;
	}

	async getMany(keys: string[]) {
		const getMany = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = ANY($1)`;
		const rows = await this.query(getMany, [keys]);
		const rowsMap = new Map(rows.map((row) => [row.key, row]));

		return keys.map((key) => rowsMap.get(key)?.value);
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any) {
		const upsert = `INSERT INTO ${this.opts.schema!}.${this.opts.table!} (key, value)
      VALUES($1, $2) 
      ON CONFLICT(key) 
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [key, value]);
	}

	async setMany(entries: KeyvEntry[]) {
		const keys = [];
		const values = [];
		for (const { key, value } of entries) {
			keys.push(key);
			values.push(value);
		}
		const upsert = `INSERT INTO ${this.opts.schema!}.${this.opts.table!} (key, value)
      SELECT * FROM UNNEST($1::text[], $2::text[])
      ON CONFLICT(key)
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [keys, values]);
	}

	async delete(key: string) {
		const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1`;
		const del = `DELETE FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1`;
		const rows = await this.query(select, [key]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [key]);
		return true;
	}

	async deleteMany(keys: string[]) {
		const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = ANY($1)`;
		const del = `DELETE FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = ANY($1)`;
		const rows = await this.query(select, [keys]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [keys]);
		return true;
	}

	async clear() {
		const del = `DELETE FROM ${this.opts.schema!}.${this.opts.table!} WHERE key LIKE $1`;
		await this.query(del, [this.namespace ? `${this.namespace}:%` : "%"]);
	}

	async *iterator(namespace?: string) {
		const limit = Number.parseInt(String(this.opts.iterationLimit!), 10) || 10;

		// Escape special LIKE pattern characters in namespace
		const escapedNamespace = namespace
			? `${namespace.replace(/[%_\\]/g, "\\$&")}:`
			: "";
		const pattern = `${escapedNamespace}%`;

		let offset = 0;

		while (true) {
			let entries: Array<{ key: string; value: string }>;

			try {
				const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key LIKE $1 LIMIT $2 OFFSET $3`;
				entries = await this.query(select, [pattern, limit, offset]);
			} catch (error) {
				// Emit error with context for debugging
				this.emit(
					"error",
					new Error(
						`Iterator failed at offset ${offset}: ${(error as Error).message}`,
					),
				);
				return;
			}

			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				// Validate entry has required fields before yielding
				if (
					entry.key !== undefined &&
					entry.key !== null &&
					entry.value !== undefined &&
					entry.value !== null
				) {
					yield [entry.key, entry.value];
				}
			}

			offset += entries.length;

			// If we got fewer entries than the limit, we've reached the end
			if (entries.length < limit) {
				return;
			}
		}
	}

	async has(key: string) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1 )`;
		const rows = await this.query(exists, [key]);
		return rows[0].exists;
	}

	async connect() {
		const conn = pool(this.opts.uri!, this.opts);
		// biome-ignore lint/suspicious/noExplicitAny: type format
		return async (sql: string, values?: any) => {
			const data = await conn.query(sql, values);
			return data.rows;
		};
	}

	async disconnect() {
		await endPool();
	}
}

export const createKeyv = (options?: KeyvPostgresOptions) =>
	new Keyv({ store: new KeyvPostgres(options) });

export default KeyvPostgres;
export type { KeyvPostgresOptions } from "./types";
