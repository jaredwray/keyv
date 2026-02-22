import { Hookified } from "hookified";
import Keyv, { type KeyvEntry, type KeyvStoreAdapter } from "keyv";
import type { DatabaseError, PoolConfig } from "pg";
import { endPool, pool } from "./pool.js";
import type { KeyvPostgresOptions, Query } from "./types.js";

/**
 * Escapes a PostgreSQL identifier (table/schema name) to prevent SQL injection.
 * Uses double-quote escaping as per PostgreSQL standards.
 */
function escapeIdentifier(identifier: string): string {
	// Replace any double quotes with two double quotes (PostgreSQL escape sequence)
	// and wrap in double quotes
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * PostgreSQL storage adapter for Keyv.
 * Uses the `pg` library for connection pooling and parameterized queries.
 */
export class KeyvPostgres extends Hookified implements KeyvStoreAdapter {
	/** Function for executing SQL queries against the PostgreSQL database. */
	private query: Query;
	private _namespace?: string;

	/**
	 * The PostgreSQL connection URI.
	 * @default 'postgresql://localhost:5432'
	 */
	private _uri = "postgresql://localhost:5432";

	/**
	 * The table name used for storage.
	 * @default 'keyv'
	 */
	private _table = "keyv";

	/**
	 * The maximum key size (VARCHAR length) for the key column.
	 * @default 255
	 */
	private _keySize = 255;

	/**
	 * The PostgreSQL schema name.
	 * @default 'public'
	 */
	private _schema = "public";

	/**
	 * The SSL configuration for the PostgreSQL connection.
	 * @default undefined
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	private _ssl: any;

	/**
	 * The database dialect identifier.
	 * @default 'postgres'
	 */
	private _dialect = "postgres";

	/**
	 * The number of rows to fetch per iteration batch.
	 * @default 10
	 */
	private _iterationLimit = 10;

	/**
	 * Whether to use a PostgreSQL unlogged table (faster writes, no WAL, data lost on crash).
	 * @default false
	 */
	private _useUnloggedTable = false;

	/**
	 * Additional PoolConfig properties passed through to the pg connection pool.
	 */
	private _poolConfig: PoolConfig = {};

	/**
	 * Creates a new KeyvPostgres instance.
	 * @param options - A PostgreSQL connection URI string or a {@link KeyvPostgresOptions} configuration object.
	 */
	constructor(options?: KeyvPostgresOptions | string) {
		super();

		if (typeof options === "string") {
			this._uri = options;
		} else if (options) {
			this.setOptions(options);
		}

		let createTable = `CREATE${this._useUnloggedTable ? " UNLOGGED " : " "}TABLE IF NOT EXISTS ${this._schema}.${this._table}(key VARCHAR(${Number(this._keySize)}) PRIMARY KEY, value TEXT )`;

		if (this._schema !== "public") {
			createTable = `CREATE SCHEMA IF NOT EXISTS ${this._schema}; ${createTable}`;
		}

		const connected = this.connect()
			.then(async (query) => {
				try {
					await query(createTable);
				} catch (error) {
					/* v8 ignore next -- @preserve */
					if ((error as DatabaseError).code !== "23505") {
						this.emit("error", error);
					}

					/* v8 ignore next -- @preserve */
					return query;
				}

				return query;
			})
			/* v8 ignore start -- @preserve */
			.catch((error) => this.emit("error", error));
		/* v8 ignore stop */

		// biome-ignore lint/suspicious/noExplicitAny: type format
		this.query = async (sqlString: string, values?: any) =>
			connected
				// @ts-expect-error - query is not a boolean
				.then((query) => query(sqlString, values));
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
	 * Get the PostgreSQL connection URI.
	 * @default 'postgresql://localhost:5432'
	 */
	public get uri(): string {
		return this._uri;
	}

	/**
	 * Set the PostgreSQL connection URI.
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
	public get keySize(): number {
		return this._keySize;
	}

	/**
	 * Set the maximum key size (VARCHAR length) for the key column.
	 */
	public set keySize(value: number) {
		this._keySize = value;
	}

	/**
	 * Get the PostgreSQL schema name.
	 * @default 'public'
	 */
	public get schema(): string {
		return this._schema;
	}

	/**
	 * Set the PostgreSQL schema name.
	 */
	public set schema(value: string) {
		this._schema = value;
	}

	/**
	 * Get the SSL configuration for the PostgreSQL connection.
	 * @default undefined
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get ssl(): any {
		return this._ssl;
	}

	/**
	 * Set the SSL configuration for the PostgreSQL connection.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public set ssl(value: any) {
		this._ssl = value;
	}

	/**
	 * Get the database dialect identifier.
	 * @default 'postgres'
	 */
	public get dialect(): string {
		return this._dialect;
	}

	/**
	 * Set the database dialect identifier.
	 */
	public set dialect(value: string) {
		this._dialect = value;
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
	 * Get whether to use a PostgreSQL unlogged table (faster writes, no WAL, data lost on crash).
	 * @default false
	 */
	public get useUnloggedTable(): boolean {
		return this._useUnloggedTable;
	}

	/**
	 * Set whether to use a PostgreSQL unlogged table.
	 */
	public set useUnloggedTable(value: boolean) {
		this._useUnloggedTable = value;
	}

	/**
	 * Get the options for the adapter. This is required by the KeyvStoreAdapter interface.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get opts(): any {
		return {
			uri: this._uri,
			table: this._table,
			keySize: this._keySize,
			schema: this._schema,
			ssl: this._ssl,
			dialect: this._dialect,
			iterationLimit: this._iterationLimit,
			useUnloggedTable: this._useUnloggedTable,
			...this._poolConfig,
		};
	}

	/**
	 * Set the options for the adapter.
	 */
	public set opts(options: KeyvPostgresOptions) {
		this.setOptions(options);
	}

	/**
	 * Gets a value by key.
	 * @param key - The key to retrieve.
	 * @returns The value associated with the key, or `undefined` if not found.
	 */
	public async get<Value>(key: string): Promise<Value | undefined> {
		const select = `SELECT * FROM ${this._schema}.${this._table} WHERE key = $1`;
		const rows = await this.query(select, [key]);
		const row = rows[0];
		return row === undefined ? undefined : row.value;
	}

	/**
	 * Gets multiple values by their keys.
	 * @param keys - An array of keys to retrieve.
	 * @returns An array of values in the same order as the keys, with `undefined` for missing keys.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<Value | undefined>> {
		const getMany = `SELECT * FROM ${this._schema}.${this._table} WHERE key = ANY($1)`;
		const rows = await this.query(getMany, [keys]);
		const rowsMap = new Map(rows.map((row) => [row.key, row]));

		return keys.map((key) => rowsMap.get(key)?.value);
	}

	/**
	 * Sets a key-value pair. Uses an upsert operation via `ON CONFLICT` to insert or update.
	 * @param key - The key to set.
	 * @param value - The value to store.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public async set(key: string, value: any): Promise<void> {
		const upsert = `INSERT INTO ${this._schema}.${this._table} (key, value)
      VALUES($1, $2)
      ON CONFLICT(key)
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [key, value]);
	}

	/**
	 * Sets multiple key-value pairs at once using PostgreSQL `UNNEST` for efficient bulk operations.
	 * @param entries - An array of key-value entry objects.
	 */
	public async setMany(entries: KeyvEntry[]): Promise<void> {
		const keys = [];
		const values = [];
		for (const { key, value } of entries) {
			keys.push(key);
			values.push(value);
		}
		const upsert = `INSERT INTO ${this._schema}.${this._table} (key, value)
      SELECT * FROM UNNEST($1::text[], $2::text[])
      ON CONFLICT(key)
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [keys, values]);
	}

	/**
	 * Deletes a key from the store.
	 * @param key - The key to delete.
	 * @returns `true` if the key existed and was deleted, `false` otherwise.
	 */
	public async delete(key: string): Promise<boolean> {
		const select = `SELECT * FROM ${this._schema}.${this._table} WHERE key = $1`;
		const del = `DELETE FROM ${this._schema}.${this._table} WHERE key = $1`;
		const rows = await this.query(select, [key]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [key]);
		return true;
	}

	/**
	 * Deletes multiple keys from the store at once.
	 * @param keys - An array of keys to delete.
	 * @returns `true` if any of the keys existed and were deleted, `false` otherwise.
	 */
	public async deleteMany(keys: string[]): Promise<boolean> {
		const select = `SELECT * FROM ${this._schema}.${this._table} WHERE key = ANY($1)`;
		const del = `DELETE FROM ${this._schema}.${this._table} WHERE key = ANY($1)`;
		const rows = await this.query(select, [keys]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [keys]);
		return true;
	}

	/**
	 * Clears all keys in the current namespace. If no namespace is set, all keys are removed.
	 */
	public async clear(): Promise<void> {
		const del = `DELETE FROM ${this._schema}.${this._table} WHERE key LIKE $1`;
		await this.query(del, [this._namespace ? `${this._namespace}:%` : "%"]);
	}

	/**
	 * Iterates over all key-value pairs, optionally filtered by namespace.
	 * Uses cursor-based (keyset) pagination with batch size controlled by `iterationLimit`.
	 * @param namespace - Optional namespace to filter keys by.
	 * @yields A `[key, value]` tuple for each entry.
	 */
	public async *iterator(
		namespace?: string,
	): AsyncGenerator<[string, string], void, unknown> {
		const limit = this._iterationLimit;

		// Escape special LIKE pattern characters in namespace
		const escapedNamespace = namespace
			? `${namespace.replace(/[%_\\]/g, "\\$&")}:`
			: "";
		const pattern = `${escapedNamespace}%`;

		// Use keyset pagination (cursor-based) instead of OFFSET to handle
		// concurrent deletions during iteration without skipping entries
		let lastKey: string | null = null;

		while (true) {
			let entries: Array<{ key: string; value: string }>;

			try {
				let select: string;
				let params: Array<string | number>;

				if (lastKey === null) {
					// First batch: no cursor constraint
					select = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key LIKE $1 ORDER BY key LIMIT $2`;
					params = [pattern, limit];
				} else {
					// Subsequent batches: use keyset pagination
					select = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key LIKE $1 AND key > $2 ORDER BY key LIMIT $3`;
					params = [pattern, lastKey, limit];
				}

				entries = await this.query(select, params);
				/* v8 ignore start -- @preserve */
			} catch (error) {
				// Emit error with context for debugging
				this.emit(
					"error",
					new Error(
						`Iterator failed at cursor ${lastKey ?? "start"}: ${(error as Error).message}`,
					),
				);
				return;
			}
			/* v8 ignore stop */

			/* v8 ignore next -- @preserve */
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				// Validate entry has key before yielding
				/* v8 ignore next -- @preserve */
				if (entry.key !== undefined && entry.key !== null) {
					yield [entry.key, entry.value];
				}
			}

			// Update cursor to the last key processed
			lastKey = entries[entries.length - 1].key;

			// If we got fewer entries than the limit, we've reached the end
			if (entries.length < limit) {
				return;
			}
		}
	}

	/**
	 * Checks whether a key exists in the store.
	 * @param key - The key to check.
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this._schema}.${this._table} WHERE key = $1 )`;
		const rows = await this.query(exists, [key]);
		return rows[0].exists;
	}

	/**
	 * Checks whether multiple keys exist in the store.
	 * @param keys - An array of keys to check.
	 * @returns An array of booleans in the same order as the input keys.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const select = `SELECT key FROM ${this._schema}.${this._table} WHERE key = ANY($1)`;
		const rows = await this.query(select, [keys]);
		const existingKeys = new Set(rows.map((row: { key: string }) => row.key));
		return keys.map((key) => existingKeys.has(key));
	}

	/**
	 * Establishes a connection to the PostgreSQL database via the connection pool.
	 * @returns A query function that executes SQL statements and returns result rows.
	 */
	private async connect() {
		const conn = pool(this._uri, { ssl: this._ssl, ...this._poolConfig });
		// biome-ignore lint/suspicious/noExplicitAny: type format
		return async (sql: string, values?: any) => {
			const data = await conn.query(sql, values);
			return data.rows;
		};
	}

	/**
	 * Disconnects from the PostgreSQL database and releases the connection pool.
	 */
	public async disconnect(): Promise<void> {
		await endPool();
	}

	private setOptions(options: KeyvPostgresOptions): void {
		if (options.uri !== undefined) {
			this._uri = options.uri;
		}

		if (options.table !== undefined) {
			this._table = options.table;
		}

		if (options.keySize !== undefined) {
			this._keySize = options.keySize;
		}

		if (options.schema !== undefined) {
			this._schema = options.schema;
		}

		if (options.ssl !== undefined) {
			this._ssl = options.ssl;
		}

		if (options.dialect !== undefined) {
			this._dialect = options.dialect;
		}

		if (options.iterationLimit !== undefined) {
			this._iterationLimit = options.iterationLimit;
		}

		if (options.useUnloggedTable !== undefined) {
			this._useUnloggedTable = options.useUnloggedTable;
		}

		const {
			uri,
			table,
			keySize,
			schema,
			ssl,
			dialect,
			iterationLimit,
			useUnloggedTable,
			...poolConfigRest
		} = options;

		this._poolConfig = { ...this._poolConfig, ...poolConfigRest };
	}
}

/**
 * Helper function to create a Keyv instance with KeyvPostgres as the storage adapter.
 * @param options - Optional {@link KeyvPostgresOptions} configuration object.
 * @returns A new Keyv instance backed by PostgreSQL.
 */
export const createKeyv = (options?: KeyvPostgresOptions) =>
	new Keyv({ store: new KeyvPostgres(options) });

export default KeyvPostgres;
export type { KeyvPostgresOptions } from "./types";
