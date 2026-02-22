import type { ConnectionOptions } from "node:tls";
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

	/** Promise that resolves to the query function once initialization completes. */
	private _connected: Promise<Query>;

	/** The namespace used to prefix keys for multi-tenant separation. */
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
	 * The maximum key length (VARCHAR length) for the key column.
	 * @default 255
	 */
	private _keyLength = 255;

	/**
	 * The maximum namespace length (VARCHAR length) for the namespace column.
	 * @default 255
	 */
	private _namespaceLength = 255;

	/**
	 * The PostgreSQL schema name.
	 * @default 'public'
	 */
	private _schema = "public";

	/**
	 * The SSL configuration for the PostgreSQL connection.
	 * @default undefined
	 */
	private _ssl?: boolean | ConnectionOptions;

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

		const schemaEsc = escapeIdentifier(this._schema);
		const tableEsc = escapeIdentifier(this._table);

		let createTable = `CREATE${this._useUnloggedTable ? " UNLOGGED " : " "}TABLE IF NOT EXISTS ${schemaEsc}.${tableEsc}(key VARCHAR(${Number(this._keyLength)}) NOT NULL, value TEXT, namespace VARCHAR(${Number(this._namespaceLength)}) DEFAULT NULL)`;

		if (this._schema !== "public") {
			createTable = `CREATE SCHEMA IF NOT EXISTS ${schemaEsc}; ${createTable}`;
		}

		const migration = `ALTER TABLE ${schemaEsc}.${tableEsc} ADD COLUMN IF NOT EXISTS namespace VARCHAR(${Number(this._namespaceLength)}) DEFAULT NULL`;
		const dropOldPk = `ALTER TABLE ${schemaEsc}.${tableEsc} DROP CONSTRAINT IF EXISTS ${escapeIdentifier(`${this._table}_pkey`)}`;
		const createIndex = `CREATE UNIQUE INDEX IF NOT EXISTS ${escapeIdentifier(`${this._table}_key_namespace_idx`)} ON ${schemaEsc}.${tableEsc} (key, COALESCE(namespace, ''))`;

		this._connected = this.init(createTable, migration, dropOldPk, createIndex)
			/* v8 ignore start -- @preserve */
			.catch((error) => {
				this.emit("error", error);
				throw error; // Re-throw so subsequent queries fail with a clear error
			});
		/* v8 ignore stop */

		// biome-ignore lint/suspicious/noExplicitAny: type format
		this.query = async (sqlString: string, values?: any) => {
			const query = await this._connected;
			return query(sqlString, values);
		};
	}

	/**
	 * Initializes the database connection and ensures the table schema exists.
	 * Called from the constructor; errors are emitted rather than thrown.
	 */
	private async init(
		createTable: string,
		migration: string,
		dropOldPk: string,
		createIndex: string,
	): Promise<Query> {
		const query = await this.connect();

		try {
			await query(createTable);
			await query(migration);
			await query(dropOldPk);
			await query(createIndex);
		} catch (error) {
			// 23505 = unique_violation: safe to ignore when concurrent instances
			// race to create the same index (the index already exists).
			/* v8 ignore next -- @preserve */
			if ((error as DatabaseError).code !== "23505") {
				this.emit("error", error);
			}
		}

		return query;
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
	 * Get the maximum key length (VARCHAR length) for the key column.
	 * @default 255
	 */
	public get keyLength(): number {
		return this._keyLength;
	}

	/**
	 * Set the maximum key length (VARCHAR length) for the key column.
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
	public get ssl(): boolean | ConnectionOptions | undefined {
		return this._ssl;
	}

	/**
	 * Set the SSL configuration for the PostgreSQL connection.
	 */
	public set ssl(value: boolean | ConnectionOptions | undefined) {
		this._ssl = value;
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
			keyLength: this._keyLength,
			namespaceLength: this._namespaceLength,
			schema: this._schema,
			ssl: this._ssl,
			dialect: "postgres",
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
		const strippedKey = this.removeKeyPrefix(key);
		const select = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(select, [
			strippedKey,
			this.getNamespaceValue(),
		]);
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
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const getMany = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(getMany, [
			strippedKeys,
			this.getNamespaceValue(),
		]);
		const rowsMap = new Map(rows.map((row) => [row.key, row]));

		return strippedKeys.map((key) => rowsMap.get(key)?.value);
	}

	/**
	 * Sets a key-value pair. Uses an upsert operation via `ON CONFLICT` to insert or update.
	 * @param key - The key to set.
	 * @param value - The value to store.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public async set(key: string, value: any): Promise<void> {
		const strippedKey = this.removeKeyPrefix(key);
		const upsert = `INSERT INTO ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} (key, value, namespace)
      VALUES($1, $2, $3)
      ON CONFLICT(key, COALESCE(namespace, ''))
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [strippedKey, value, this.getNamespaceValue()]);
	}

	/**
	 * Sets multiple key-value pairs at once using PostgreSQL `UNNEST` for efficient bulk operations.
	 * @param entries - An array of key-value entry objects.
	 */
	public async setMany(entries: KeyvEntry[]): Promise<void> {
		const keys = [];
		const values = [];
		for (const { key, value } of entries) {
			keys.push(this.removeKeyPrefix(key));
			values.push(value);
		}
		const upsert = `INSERT INTO ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} (key, value, namespace)
      SELECT k, v, $3 FROM UNNEST($1::text[], $2::text[]) AS t(k, v)
      ON CONFLICT(key, COALESCE(namespace, ''))
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [keys, values, this.getNamespaceValue()]);
	}

	/**
	 * Deletes a key from the store.
	 * @param key - The key to delete.
	 * @returns `true` if the key existed and was deleted, `false` otherwise.
	 */
	public async delete(key: string): Promise<boolean> {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '') RETURNING 1`;
		const rows = await this.query(del, [strippedKey, ns]);
		return rows.length > 0;
	}

	/**
	 * Deletes multiple keys from the store at once.
	 * @param keys - An array of keys to delete.
	 * @returns `true` if any of the keys existed and were deleted, `false` otherwise.
	 */
	public async deleteMany(keys: string[]): Promise<boolean> {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '') RETURNING 1`;
		const rows = await this.query(del, [strippedKeys, ns]);
		return rows.length > 0;
	}

	/**
	 * Clears all keys in the current namespace. If no namespace is set, all keys are removed.
	 */
	public async clear(): Promise<void> {
		if (this._namespace) {
			const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE namespace = $1`;
			await this.query(del, [this._namespace]);
		} else {
			const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE namespace IS NULL`;
			await this.query(del);
		}
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
		const limit = Number.parseInt(String(this._iterationLimit), 10) || 10;
		const namespaceValue = namespace ?? null;

		// Use keyset pagination (cursor-based) instead of OFFSET to handle
		// concurrent deletions during iteration without skipping entries
		let lastKey: string | null = null;

		while (true) {
			let entries: Array<{ key: string; value: string }>;

			try {
				const where: string[] = [];
				const params: Array<string | number | null> = [];

				if (namespaceValue !== null) {
					where.push(`namespace = $${params.length + 1}`);
					params.push(namespaceValue);
				} else {
					where.push("namespace IS NULL");
				}

				if (lastKey !== null) {
					where.push(`key > $${params.length + 1}`);
					params.push(lastKey);
				}

				const select = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE ${where.join(" AND ")} ORDER BY key LIMIT $${params.length + 1}`;
				params.push(limit);

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
					// Re-add namespace prefix for core compatibility
					const prefixedKey = namespace
						? `${namespace}:${entry.key}`
						: entry.key;
					yield [prefixedKey, entry.value];
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
		const strippedKey = this.removeKeyPrefix(key);
		const exists = `SELECT EXISTS ( SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '') )`;
		const rows = await this.query(exists, [
			strippedKey,
			this.getNamespaceValue(),
		]);
		return rows[0].exists;
	}

	/**
	 * Checks whether multiple keys exist in the store.
	 * @param keys - An array of keys to check.
	 * @returns An array of booleans in the same order as the input keys.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const select = `SELECT key FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(select, [
			strippedKeys,
			this.getNamespaceValue(),
		]);
		const existingKeys = new Set(rows.map((row: { key: string }) => row.key));
		return strippedKeys.map((key) => existingKeys.has(key));
	}

	/**
	 * Establishes a connection to the PostgreSQL database via the connection pool.
	 * @returns A query function that executes SQL statements and returns result rows.
	 */
	private async connect() {
		const conn = pool(this._uri, { ...this._poolConfig, ssl: this._ssl });
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
		await endPool(this._uri, { ...this._poolConfig, ssl: this._ssl });
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
	 * Returns the namespace value for SQL parameters. Returns null when no namespace is set.
	 */
	private getNamespaceValue(): string | null {
		return this._namespace ?? null;
	}

	private setOptions(options: KeyvPostgresOptions): void {
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

		if (options.schema !== undefined) {
			this._schema = options.schema;
		}

		if (options.ssl !== undefined) {
			this._ssl = options.ssl;
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
			keyLength,
			namespaceLength,
			schema,
			ssl,
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
