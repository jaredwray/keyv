// biome-ignore-all lint/style/noNonNullAssertion: need to fix
import EventEmitter from "node:events";
import type { KeyvEntry, KeyvStoreAdapter, StoredData } from "keyv";
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
	"namespaceLength",
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
			namespaceLength: 255,
			...options,
		};

		const tableEsc = escapeIdentifier(this.opts.table!);
		const indexName = `\`${(this.opts.table! + "_key_namespace_idx").replace(/`/g, "``")}\``;
		const createTable = `CREATE TABLE IF NOT EXISTS ${tableEsc}(id VARCHAR(${Number(this.opts.keySize!)}) NOT NULL, value TEXT, namespace VARCHAR(${Number(this.opts.namespaceLength!)}) NOT NULL DEFAULT '', UNIQUE INDEX ${indexName} (id, namespace))`;

		/* v8 ignore next -- @preserve */
		const connected = connection().then(async (query) => {
			await query(createTable);

			// Migration for existing tables: add namespace column
			try {
				await query(
					`ALTER TABLE ${tableEsc} ADD COLUMN namespace VARCHAR(${Number(this.opts.namespaceLength!)}) NOT NULL DEFAULT ''`,
				);
			} catch (error) {
				// Error 1060 = Duplicate column name - column already exists, safe to ignore
				if ((error as { errno?: number }).errno !== 1060) {
					throw error;
				}
			}

			// Migration: drop old primary key (id alone)
			try {
				await query(`ALTER TABLE ${tableEsc} DROP PRIMARY KEY`);
			} catch (error) {
				// Error 1091 = Can't DROP - PK doesn't exist (already migrated), safe to ignore
				if ((error as { errno?: number }).errno !== 1091) {
					throw error;
				}
			}

			// Migration: create composite unique index
			try {
				await query(
					`CREATE UNIQUE INDEX ${indexName} ON ${tableEsc} (id, namespace)`,
				);
			} catch (error) {
				// Error 1061 = Duplicate key name - index already exists, safe to ignore
				if ((error as { errno?: number }).errno !== 1061) {
					throw error;
				}
			}

			if (
				this.opts.intervalExpiration !== undefined &&
				this.opts.intervalExpiration > 0
			) {
				await query("SET GLOBAL event_scheduler = ON;");
				await query("DROP EVENT IF EXISTS keyv_delete_expired_keys;");
				await query(`CREATE EVENT IF NOT EXISTS keyv_delete_expired_keys ON SCHEDULE EVERY ${this.opts.intervalExpiration} SECOND
					DO DELETE FROM ${tableEsc}
					WHERE CAST(value->'$.expires' AS UNSIGNED) BETWEEN 1 AND UNIX_TIMESTAMP(NOW(3)) * 1000;`);
			}

			return query;
		});

		this.query = async <T>(sqlString: string): QueryType<T> => {
			const query = await connected;
			return query(sqlString) as QueryType<T>;
		};
	}

	/**
	 * Strips the namespace prefix from a key that was added by the Keyv core.
	 * For example, if namespace is "ns" and key is "ns:foo", returns "foo".
	 */
	private removeKeyPrefix(key: string): string {
		if (this.namespace && key.startsWith(`${this.namespace}:`)) {
			return key.slice(this.namespace.length + 1);
		}

		return key;
	}

	/**
	 * Returns the namespace value for SQL parameters.
	 * Returns empty string when no namespace is set.
	 */
	private getNamespaceValue(): string {
		return this.namespace ?? "";
	}

	/**
	 * Retrieves a value from the store by key.
	 * @param key - The key to retrieve
	 * @returns The stored value or undefined if not found
	 */
	async get<Value>(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const sql = `SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ? AND namespace = ?`;
		const select = mysql.format(sql, [strippedKey, this.getNamespaceValue()]);

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
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const sql = `SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id IN (?) AND namespace = ?`;
		const select = mysql.format(sql, [strippedKeys, this.getNamespaceValue()]);

		const rows: mysql.RowDataPacket = await this.query(select);

		const results: Array<StoredData<Value>> = [];

		for (const key of strippedKeys) {
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
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const sql = `INSERT INTO ${escapeIdentifier(this.opts.table!)} (id, value, namespace)
			VALUES(?, ?, ?)
			ON DUPLICATE KEY UPDATE value=?;`;
		const insert = [strippedKey, value, ns, value];
		const upsert = mysql.format(sql, insert);
		return this.query(upsert);
	}

	/**
	 * Sets multiple key-value pairs at once.
	 * @param entries - Array of key-value entry objects
	 * @returns Promise that resolves when the operation completes
	 */
	async setMany(entries: KeyvEntry[]): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const ns = this.getNamespaceValue();
		const values = entries.map(({ key, value }) => [
			this.removeKeyPrefix(key),
			value,
			ns,
		]);
		const placeholders = values.map(() => "(?, ?, ?)").join(", ");
		const flatValues = values.flat();
		const sql = `INSERT INTO ${escapeIdentifier(this.opts.table!)} (id, value, namespace)
			VALUES ${placeholders}
			ON DUPLICATE KEY UPDATE value=VALUES(value);`;
		const upsert = mysql.format(sql, flatValues);
		await this.query(upsert);
	}

	/**
	 * Deletes a key-value pair from the store.
	 * @param key - The key to delete
	 * @returns True if the key existed and was deleted, false if the key did not exist
	 */
	async delete(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const sql = `SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ? AND namespace = ?`;
		const select = mysql.format(sql, [strippedKey, ns]);
		const delSql = `DELETE FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ? AND namespace = ?`;
		const del = mysql.format(delSql, [strippedKey, ns]);

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
		const strippedKeys = key.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const sql = `DELETE FROM ${escapeIdentifier(this.opts.table!)} WHERE id IN (?) AND namespace = ?`;
		const del = mysql.format(sql, [strippedKeys, ns]);

		const result: mysql.ResultSetHeader = await this.query(del);
		return result.affectedRows !== 0;
	}

	/**
	 * Clears all entries from the store.
	 * If a namespace is set, only entries within that namespace are cleared.
	 * @returns Promise that resolves when the operation completes
	 */
	async clear() {
		const ns = this.getNamespaceValue();
		const sql = `DELETE FROM ${escapeIdentifier(this.opts.table!)} WHERE namespace = ?`;
		const del = mysql.format(sql, [ns]);

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
		const namespaceValue = namespace ?? "";

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
					`SELECT * FROM ${escapeIdentifier(options.table!)} WHERE namespace = ? ORDER BY id LIMIT ?`,
					[namespaceValue, limit],
				);
			} else {
				// Subsequent batches: use keyset pagination
				sql = mysql.format(
					`SELECT * FROM ${escapeIdentifier(options.table!)} WHERE namespace = ? AND id > ? ORDER BY id LIMIT ?`,
					[namespaceValue, lastKey, limit],
				);
			}

			const entries: mysql.RowDataPacket[] = await query(sql);
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				// Re-add namespace prefix for core compatibility
				const prefixedKey = namespace ? `${namespace}:${entry.id}` : entry.id;
				yield [prefixedKey, entry.value];
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
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const sql = `SELECT EXISTS ( SELECT * FROM ${escapeIdentifier(this.opts.table!)} WHERE id = ? AND namespace = ? )`;
		const exists = mysql.format(sql, [strippedKey, ns]);
		const rows = await this.query(exists);
		return Object.values(rows[0])[0] === 1;
	}

	/**
	 * Checks whether multiple keys exist in the store.
	 * @param keys - Array of keys to check
	 * @returns Array of booleans in the same order as the input keys
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const sql = `SELECT id FROM ${escapeIdentifier(this.opts.table!)} WHERE id IN (?) AND namespace = ?`;
		const select = mysql.format(sql, [strippedKeys, ns]);
		const rows: mysql.RowDataPacket[] = await this.query(select);
		const existingKeys = new Set(rows.map((row) => row.id as string));
		return strippedKeys.map((key) => existingKeys.has(key));
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
