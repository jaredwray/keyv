// biome-ignore-all lint/style/noNonNullAssertion: need to fix
import EventEmitter from "node:events";
import type { KeyvStoreAdapter, StoredData } from "keyv";
import mysql from "mysql2";
import { endPool, pool } from "./pool.js";
import type { KeyvMysqlOptions } from "./types.js";

/**
 * Escapes a MySQL identifier (table/column name) to prevent SQL injection.
 * Handles database-qualified names like "mydb.table" by escaping each segment.
 * Uses backtick escaping as per MySQL standards.
 */
function escapeIdentifier(identifier: string): string {
	// Split on '.' to handle database-qualified names (e.g., "mydb.cache")
	// Escape each segment individually, then join with '.'
	return identifier
		.split(".")
		.map((segment) => `\`${segment.replace(/`/g, "``")}\``)
		.join(".");
}

/**
 * Set of keys that are specific to Keyv MySQL configuration.
 * These keys are filtered out when creating the MySQL connection options.
 */
const keyvMysqlKeys = new Set([
	"adapter",
	"compression",
	"connect",
	"dialect",
	"keySize",
	"table",
	"ttl",
	"uri",
]);

type QueryType<T> = Promise<
	T extends
		| mysql.RowDataPacket[][]
		| mysql.RowDataPacket[]
		| mysql.ResultSetHeader
		| mysql.ResultSetHeader[]
		? T
		: never
>;

/**
 * MySQL storage adapter for Keyv.
 * Provides a persistent key-value store using MySQL as the backend.
 */
export class KeyvMysql extends EventEmitter implements KeyvStoreAdapter {
	/**
	 * Indicates whether TTL (Time To Live) support is enabled.
	 * Set to true when intervalExpiration is configured.
	 */
	ttlSupport = false;

	/**
	 * Configuration options for the MySQL adapter.
	 */
	opts: KeyvMysqlOptions;

	/**
	 * Optional namespace for key prefixing.
	 */
	namespace?: string;

	/**
	 * Query function for executing SQL statements against the MySQL database.
	 */
	query: <T>(sqlString: string) => QueryType<T>;

	/**
	 * Creates a new KeyvMysql instance.
	 * @param keyvOptions - Configuration options or connection URI string
	 */
	constructor(keyvOptions?: KeyvMysqlOptions | string) {
		super();

		let options: KeyvMysqlOptions = {
			dialect: "mysql",
			uri: "mysql://localhost",
		};

		if (typeof keyvOptions === "string") {
			options.uri = keyvOptions;
		} else {
			options = {
				...options,
				...keyvOptions,
			};
		}

		if (
			options.intervalExpiration !== undefined &&
			options.intervalExpiration > 0
		) {
			this.ttlSupport = true;
		}

		const mysqlOptions = Object.fromEntries(
			Object.entries(options).filter(([k]) => !keyvMysqlKeys.has(k)),
		);

		delete mysqlOptions.namespace;
		delete mysqlOptions.serialize;
		delete mysqlOptions.deserialize;

		const connection = async () => {
			const conn = pool(options.uri!, mysqlOptions);
			return async (sql: string) => {
				const data = await conn.query(sql);
				return data[0];
			};
		};

		this.opts = {
			table: "keyv",
			keySize: 255,
			...options,
		};

		const createTable = `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(this.opts.table!)}(id VARCHAR(${Number(this.opts.keySize!)}) PRIMARY KEY, value TEXT)`;

		/* v8 ignore next -- @preserve */
		const connected = connection()
			.then(async (query) => {
				await query(createTable);
				if (
					this.opts.intervalExpiration !== undefined &&
					this.opts.intervalExpiration > 0
				) {
					await query("SET GLOBAL event_scheduler = ON;");
					await query("DROP EVENT IF EXISTS keyv_delete_expired_keys;");
					await query(`CREATE EVENT IF NOT EXISTS keyv_delete_expired_keys ON SCHEDULE EVERY ${this.opts.intervalExpiration} SECOND
					DO DELETE FROM ${escapeIdentifier(this.opts.table!)}
					WHERE CAST(value->'$.expires' AS UNSIGNED) BETWEEN 1 AND UNIX_TIMESTAMP(NOW(3)) * 1000;`);
				}

				return query;
			})
			.catch((error) => {
				this.emit("error", error);
				throw error;
			});

		this.query = async <T>(sqlString: string): QueryType<T> => {
			const query = await connected;
			return query(sqlString) as QueryType<T>;
		};
	}

	/**
	 * Retrieves a value from the store by key.
	 * @param key - The key to retrieve
	 * @returns The stored value or undefined if not found
	 */
	async get<Value>(key: string) {
		const sql = `SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ?`;
		const select = mysql.format(sql, [key]);

		const rows: mysql.RowDataPacket = await this.query(select);
		const row = rows[0];

		return row?.value as StoredData<Value>;
	}

	/**
	 * Retrieves multiple values from the store by their keys.
	 * @param keys - Array of keys to retrieve
	 * @returns Array of stored values in the same order as the input keys, with undefined for missing keys
	 */
	async getMany<Value>(keys: string[]) {
		const sql = `SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id IN (?)`;
		const select = mysql.format(sql, [keys]);

		const rows: mysql.RowDataPacket = await this.query(select);

		const results: Array<StoredData<Value>> = [];

		for (const key of keys) {
			const rowIndex = rows.findIndex((row: { id: string }) => row.id === key);
			results.push(
				rowIndex === -1
					? undefined
					: (rows[rowIndex].value as StoredData<Value>),
			);
		}

		return results;
	}

	/**
	 * Sets a value in the store for the given key.
	 * If the key already exists, it will be updated.
	 * @param key - The key to set
	 * @param value - The value to store
	 * @returns Promise that resolves when the operation completes
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any) {
		const sql = `INSERT INTO ${escapeIdentifier(this.opts.table!)} (id, value)
			VALUES(?, ?)
			ON DUPLICATE KEY UPDATE value=?;`;
		const insert = [key, value, value];
		const upsert = mysql.format(sql, insert);
		return this.query(upsert);
	}

	/**
	 * Deletes a key-value pair from the store.
	 * @param key - The key to delete
	 * @returns True if the key existed and was deleted, false if the key did not exist
	 */
	async delete(key: string) {
		const sql = `SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ?`;
		const select = mysql.format(sql, [key]);
		const delSql = `DELETE FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ?`;
		const del = mysql.format(delSql, [key]);

		const rows: mysql.RowDataPacket = await this.query(select);
		const row = rows[0];

		if (row === undefined) {
			return false;
		}

		await this.query(del);
		return true;
	}

	/**
	 * Deletes multiple key-value pairs from the store.
	 * @param key - Array of keys to delete
	 * @returns True if at least one key was deleted, false if no keys were found
	 */
	async deleteMany(key: string[]) {
		const sql = `DELETE FROM ${escapeIdentifier(this.opts.table!)} WHERE id IN (?)`;
		const del = mysql.format(sql, [key]);

		const result: mysql.ResultSetHeader = await this.query(del);
		return result.affectedRows !== 0;
	}

	/**
	 * Clears all entries from the store.
	 * If a namespace is set, only entries within that namespace are cleared.
	 * @returns Promise that resolves when the operation completes
	 */
	async clear() {
		const sql = `DELETE FROM ${escapeIdentifier(this.opts.table!)} WHERE id LIKE ?`;
		const del = mysql.format(sql, [
			this.namespace ? `${this.namespace}:%` : "%",
		]);

		await this.query(del);
	}

	/**
	 * Returns an async iterator for iterating over all key-value pairs in the store.
	 * Uses keyset pagination (cursor-based) to handle concurrent deletions without skipping entries.
	 * @param namespace - Optional namespace to filter results
	 * @yields Arrays containing [key, value] pairs
	 */
	async *iterator(namespace?: string) {
		const limit =
			Number.parseInt(this.opts.iterationLimit! as string, 10) || 10;
		// biome-ignore lint/style/useTemplate: need to fix
		const pattern = `${namespace ? namespace + ":" : ""}%`;

		// @ts-expect-error - iterate
		async function* iterate(
			lastKey: string | null,
			options: KeyvMysqlOptions,
			query: <T>(sqlString: string) => QueryType<T>,
		) {
			let sql: string;
			if (lastKey === null) {
				// First batch: no cursor constraint
				sql = mysql.format(
					`SELECT * FROM ${escapeIdentifier(options.table!)} WHERE id LIKE ? ORDER BY id LIMIT ?`,
					[pattern, limit],
				);
			} else {
				// Subsequent batches: use keyset pagination
				sql = mysql.format(
					`SELECT * FROM ${escapeIdentifier(options.table!)} WHERE id LIKE ? AND id > ? ORDER BY id LIMIT ?`,
					[pattern, lastKey, limit],
				);
			}

			const entries: mysql.RowDataPacket[] = await query(sql);
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				yield [entry.id, entry.value];
			}

			// Continue with next batch using last key as cursor
			if (entries.length === limit) {
				yield* iterate(entries[entries.length - 1].id, options, query);
			}
		}

		yield* iterate(null, this.opts, this.query);
	}

	/**
	 * Checks if a key exists in the store.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	async has(key: string) {
		const sql = `SELECT EXISTS ( SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ? )`;
		const exists = mysql.format(sql, [key]);
		const rows = await this.query(exists);
		return Object.values(rows[0])[0] === 1;
	}

	/**
	 * Disconnects from the MySQL database and closes the connection pool.
	 * @returns Promise that resolves when disconnected
	 */
	async disconnect() {
		endPool();
	}
}

export default KeyvMysql;
export type { KeyvMysqlOptions } from "./types";
