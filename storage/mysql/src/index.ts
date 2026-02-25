import { Hookified } from "hookified";
import Keyv, {
	type KeyvEntry,
	type KeyvStoreAdapter,
	type StoredData,
} from "keyv";
import mysql, { type ConnectionOptions } from "mysql2";
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
export class KeyvMysql extends Hookified implements KeyvStoreAdapter {
	/**
	 * The MySQL connection URI.
	 * @default 'mysql://localhost'
	 */
	private _uri = "mysql://localhost";

	/**
	 * The table name used for storage.
	 * @default 'keyv'
	 */
	private _table = "keyv";

	/**
	 * The maximum key size (VARCHAR length) for the key column.
	 * @default 255
	 */
	private _keyLength = 255;

	/**
	 * The maximum namespace length (VARCHAR length) for the namespace column.
	 * @default 255
	 */
	private _namespaceLength = 255;

	/**
	 * The interval in seconds for MySQL event scheduler cleanup of expired entries.
	 * A value of undefined or 0 disables the automatic cleanup.
	 * @default undefined
	 */
	private _intervalExpiration?: number;

	/**
	 * The number of rows to fetch per iteration batch.
	 * @default 10
	 */
	private _iterationLimit = 10;

	/**
	 * The namespace used to prefix keys for multi-tenant separation.
	 */
	private _namespace?: string;

	/**
	 * Additional mysql2 ConnectionOptions passed through to the connection pool.
	 */
	private _mysqlOptions: ConnectionOptions = {};

	/**
	 * Query function for executing SQL statements against the MySQL database.
	 */
	public query: <T>(sqlString: string) => QueryType<T>;

	/**
	 * Get the MySQL connection URI.
	 * @default 'mysql://localhost'
	 */
	public get uri(): string {
		return this._uri;
	}

	/**
	 * Set the MySQL connection URI.
	 */
	public set uri(value: string) {
		this._uri = value;
	}

	/**
	 * Get the table name used for storage.
	 * @default 'keyv'
	 */
	public get table(): string {
		return this._table;
	}

	/**
	 * Set the table name used for storage.
	 */
	public set table(value: string) {
		this._table = value;
	}

	/**
	 * Get the maximum key size (VARCHAR length) for the key column.
	 * @default 255
	 */
	public get keyLength(): number {
		return this._keyLength;
	}

	/**
	 * Set the maximum key size (VARCHAR length) for the key column.
	 */
	public set keyLength(value: number) {
		this._keyLength = value;
	}

	/**
	 * Get the maximum namespace length (VARCHAR length) for the namespace column.
	 * @default 255
	 */
	public get namespaceLength(): number {
		return this._namespaceLength;
	}

	/**
	 * Set the maximum namespace length (VARCHAR length) for the namespace column.
	 */
	public set namespaceLength(value: number) {
		this._namespaceLength = value;
	}

	/**
	 * Get the interval in seconds for MySQL event scheduler cleanup of expired entries.
	 * A value of undefined or 0 disables the automatic cleanup.
	 * @default undefined
	 */
	public get intervalExpiration(): number | undefined {
		return this._intervalExpiration;
	}

	/**
	 * Set the interval in seconds for MySQL event scheduler cleanup of expired entries.
	 */
	public set intervalExpiration(value: number | undefined) {
		this._intervalExpiration = value;
	}

	/**
	 * Get the number of rows to fetch per iteration batch.
	 * @default 10
	 */
	public get iterationLimit(): number {
		return this._iterationLimit;
	}

	/**
	 * Set the number of rows to fetch per iteration batch.
	 */
	public set iterationLimit(value: number) {
		this._iterationLimit = value;
	}

	/**
	 * Get the namespace for the adapter. If undefined, no namespace prefix is applied.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the options for the adapter. This is provided for backward compatibility.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get opts(): any {
		return {
			dialect: "mysql",
			url: this._uri,
			uri: this._uri,
			table: this._table,
			keyLength: this._keyLength,
			namespaceLength: this._namespaceLength,
			intervalExpiration: this._intervalExpiration,
			iterationLimit: this._iterationLimit,
			...this._mysqlOptions,
		};
	}

	/**
	 * Creates a new KeyvMysql instance.
	 * @param options - Configuration options or connection URI string
	 */
	constructor(options?: KeyvMysqlOptions | string) {
		super();

		if (typeof options === "string") {
			this._uri = options;
		} else if (options) {
			if (options.uri !== undefined) {
				this._uri = options.uri;
			}

			if (options.table !== undefined) {
				this._table = options.table;
			}

			if (options.keyLength !== undefined) {
				this._keyLength = options.keyLength;
			}

			if (options.namespaceLength !== undefined) {
				this._namespaceLength = options.namespaceLength;
			}

			if (options.intervalExpiration !== undefined) {
				this._intervalExpiration = options.intervalExpiration;
			}

			if (options.iterationLimit !== undefined) {
				this._iterationLimit = Number(options.iterationLimit);
			}

			this._mysqlOptions = this.generateMySqlOptions(options);
		}

		const connection = async () => {
			const conn = pool(this._uri, this._mysqlOptions);
			return async (sql: string) => {
				const data = await conn.query(sql);
				return data[0];
			};
		};

		const tableEsc = escapeIdentifier(this._table);
		const indexName = `\`${(`${this._table}_key_namespace_idx`).replace(/`/g, "``")}\``;
		const expiresIndexName = `\`${(`${this._table}_expires_idx`).replace(/`/g, "``")}\``;
		const createTable = `CREATE TABLE IF NOT EXISTS ${tableEsc}(id VARCHAR(${this._keyLength}) NOT NULL, value TEXT, namespace VARCHAR(${this._namespaceLength}) NOT NULL DEFAULT '', expires BIGINT UNSIGNED DEFAULT NULL, UNIQUE INDEX ${indexName} (id, namespace), INDEX ${expiresIndexName} (expires))`;

		/* v8 ignore next -- @preserve */
		const connected = connection().then(async (query) => {
			await query(createTable);

			// Migration for existing tables: add namespace column
			try {
				await query(
					`ALTER TABLE ${tableEsc} ADD COLUMN namespace VARCHAR(${Number(this._namespaceLength)}) NOT NULL DEFAULT ''`,
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

			// Migration: add expires column
			try {
				await query(
					`ALTER TABLE ${tableEsc} ADD COLUMN expires BIGINT UNSIGNED DEFAULT NULL`,
				);
			} catch (error) {
				if ((error as { errno?: number }).errno !== 1060) {
					throw error;
				}
			}

			// Migration: create expires index
			try {
				await query(
					`CREATE INDEX ${expiresIndexName} ON ${tableEsc} (expires)`,
				);
			} catch (error) {
				if ((error as { errno?: number }).errno !== 1061) {
					throw error;
				}
			}

			if (
				this._intervalExpiration !== undefined &&
				this._intervalExpiration > 0
			) {
				await query("SET GLOBAL event_scheduler = ON;");
				await query("DROP EVENT IF EXISTS keyv_delete_expired_keys;");
				await query(`CREATE EVENT IF NOT EXISTS keyv_delete_expired_keys ON SCHEDULE EVERY ${this._intervalExpiration} SECOND
					DO DELETE FROM ${tableEsc}
					WHERE expires BETWEEN 1 AND UNIX_TIMESTAMP(NOW(3)) * 1000;`);
			}

			return query;
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
	public async get<Value>(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const sql = `SELECT * FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ?`;
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
	public async getMany<Value>(keys: string[]) {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const sql = `SELECT * FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
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
	public async set(key: string, value: any) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const expires = this.getExpiresFromValue(value);
		const sql = `INSERT INTO ${escapeIdentifier(this._table)} (id, value, namespace, expires)
			VALUES(?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE value=?, expires=?;`;
		const insert = [strippedKey, value, ns, expires, value, expires];
		const upsert = mysql.format(sql, insert);
		return this.query(upsert);
	}

	/**
	 * Sets multiple key-value pairs at once.
	 * @param entries - Array of key-value entry objects
	 * @returns Promise that resolves when the operation completes
	 */
	public async setMany(entries: KeyvEntry[]): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const ns = this.getNamespaceValue();
		const values = entries.map(({ key, value }) => [
			this.removeKeyPrefix(key),
			value,
			ns,
			this.getExpiresFromValue(value),
		]);
		const placeholders = values.map(() => "(?, ?, ?, ?)").join(", ");
		const flatValues = values.flat();
		const sql = `INSERT INTO ${escapeIdentifier(this._table)} (id, value, namespace, expires)
			VALUES ${placeholders}
			ON DUPLICATE KEY UPDATE value=VALUES(value), expires=VALUES(expires);`;
		const upsert = mysql.format(sql, flatValues);
		await this.query(upsert);
	}

	/**
	 * Deletes a key-value pair from the store.
	 * @param key - The key to delete
	 * @returns True if the key existed and was deleted, false if the key did not exist
	 */
	public async delete(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const sql = `SELECT * FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ?`;
		const select = mysql.format(sql, [strippedKey, ns]);
		const delSql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ?`;
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
	public async deleteMany(key: string[]) {
		const strippedKeys = key.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
		const del = mysql.format(sql, [strippedKeys, ns]);

		const result: mysql.ResultSetHeader = await this.query(del);
		return result.affectedRows !== 0;
	}

	/**
	 * Clears all entries from the store.
	 * If a namespace is set, only entries within that namespace are cleared.
	 * @returns Promise that resolves when the operation completes
	 */
	public async clear() {
		const ns = this.getNamespaceValue();
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE namespace = ?`;
		const del = mysql.format(sql, [ns]);

		await this.query(del);
	}

	/**
	 * Returns an async iterator for iterating over all key-value pairs in the store.
	 * Uses keyset pagination (cursor-based) to handle concurrent deletions without skipping entries.
	 * @param namespace - Optional namespace to filter results
	 * @yields Arrays containing [key, value] pairs
	 */
	public async *iterator(
		namespace?: string,
	): AsyncGenerator<[string, string], void, unknown> {
		const limit = this._iterationLimit || 10;
		const namespaceValue = namespace ?? "";
		let lastKey: string | null = null;

		while (true) {
			let sql: string;
			if (lastKey === null) {
				// First batch: no cursor constraint
				sql = mysql.format(
					`SELECT * FROM ${escapeIdentifier(this._table)} WHERE namespace = ? ORDER BY id LIMIT ?`,
					[namespaceValue, limit],
				);
			} else {
				// Subsequent batches: use keyset pagination
				sql = mysql.format(
					`SELECT * FROM ${escapeIdentifier(this._table)} WHERE namespace = ? AND id > ? ORDER BY id LIMIT ?`,
					[namespaceValue, lastKey, limit],
				);
			}

			const entries: mysql.RowDataPacket[] = await this.query(sql);
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				// Re-add namespace prefix for core compatibility
				const prefixedKey = namespace ? `${namespace}:${entry.id}` : entry.id;
				yield [prefixedKey, entry.value];
			}

			// Update cursor to the last key processed
			lastKey = entries[entries.length - 1].id;

			// If we got fewer entries than the limit, we've reached the end
			if (entries.length < limit) {
				return;
			}
		}
	}

	/**
	 * Checks if a key exists in the store.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public async has(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const sql = `SELECT EXISTS ( SELECT * FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ? )`;
		const exists = mysql.format(sql, [strippedKey, ns]);
		const rows = await this.query(exists);
		return Object.values(rows[0])[0] === 1;
	}

	/**
	 * Checks whether multiple keys exist in the store.
	 * @param keys - Array of keys to check
	 * @returns Array of booleans in the same order as the input keys
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const sql = `SELECT id FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
		const select = mysql.format(sql, [strippedKeys, ns]);
		const rows: mysql.RowDataPacket[] = await this.query(select);
		const existingKeys = new Set(rows.map((row) => row.id as string));
		return strippedKeys.map((key) => existingKeys.has(key));
	}

	/**
	 * Deletes all expired entries from the store.
	 * Removes rows where the expires column is set and the timestamp is in the past.
	 * @returns Promise that resolves when the operation completes
	 */
	public async clearExpired(): Promise<void> {
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE expires IS NOT NULL AND expires < ?`;
		const del = mysql.format(sql, [Date.now()]);
		await this.query(del);
	}

	/**
	 * Disconnects from the MySQL database and closes the connection pool.
	 * @returns Promise that resolves when disconnected
	 */
	public async disconnect() {
		endPool();
	}

	/**
	 * Strips the namespace prefix from a key that was added by the Keyv core.
	 * For example, if namespace is "ns" and key is "ns:foo", returns "foo".
	 */
	private removeKeyPrefix(key: string): string {
		if (this._namespace && key.startsWith(`${this._namespace}:`)) {
			return key.slice(this._namespace.length + 1);
		}

		return key;
	}

	/**
	 * Returns the namespace value for SQL parameters.
	 * Returns empty string when no namespace is set.
	 */
	private getNamespaceValue(): string {
		return this._namespace ?? "";
	}

	/**
	 * Extracts the expires timestamp from a serialized value.
	 * @param value - The serialized value (string or object)
	 * @returns The expires timestamp in milliseconds, or null if not present
	 */
	// biome-ignore lint/suspicious/noExplicitAny: value can be any type
	private getExpiresFromValue(value: any): number | null {
		// biome-ignore lint/suspicious/noExplicitAny: parsed data can be any type
		let data: any;
		if (typeof value === "string") {
			try {
				data = JSON.parse(value);
			} catch {
				return null;
			}
		} else {
			data = value;
		}

		if (data && typeof data === "object" && typeof data.expires === "number") {
			return data.expires;
		}

		return null;
	}

	/**
	 * Extracts mysql2 ConnectionOptions from the full options object.
	 * Only binds known ConnectionOptions properties to the result.
	 */
	private generateMySqlOptions(options: KeyvMysqlOptions): ConnectionOptions {
		const connectionOptionsKeys: Array<keyof ConnectionOptions> = [
			"authPlugins",
			"authSwitchHandler",
			"bigNumberStrings",
			"charset",
			"charsetNumber",
			"compress",
			"connectAttributes",
			"connectTimeout",
			"connectionLimit",
			"database",
			"dateStrings",
			"debug",
			"decimalNumbers",
			"disableEval",
			"enableKeepAlive",
			"flags",
			"gracefulEnd",
			"host",
			"idleTimeout",
			"infileStreamFactory",
			"insecureAuth",
			"isServer",
			"jsonStrings",
			"keepAliveInitialDelay",
			"localAddress",
			"maxIdle",
			"maxPreparedStatements",
			"multipleStatements",
			"namedPlaceholders",
			"nestTables",
			"password",
			"password1",
			"password2",
			"password3",
			"passwordSha1",
			"pool",
			"port",
			"queueLimit",
			"queryFormat",
			"rowsAsArray",
			"socketPath",
			"ssl",
			"stream",
			"stringifyObjects",
			"supportBigNumbers",
			"timezone",
			"trace",
			"typeCast",
			"uri",
			"user",
			"waitForConnections",
		];

		const mysqlOptions: ConnectionOptions = {};
		for (const key of connectionOptionsKeys) {
			if (key in options) {
				// biome-ignore lint/suspicious/noExplicitAny: dynamically copying known keys
				(mysqlOptions as any)[key] = (options as any)[key];
			}
		}

		return mysqlOptions;
	}
}

/**
 * Helper function to create a Keyv instance with KeyvMysql as the storage adapter.
 * @param options - Optional {@link KeyvMysqlOptions} configuration object or connection URI string.
 * @returns A new Keyv instance backed by MySQL.
 */
export const createKeyv = (options?: KeyvMysqlOptions | string) =>
	new Keyv({ store: new KeyvMysql(options) });

export default KeyvMysql;
export type { KeyvMysqlOptions } from "./types";
