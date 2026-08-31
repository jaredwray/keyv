import type { ConnectionOptions } from "node:tls";
import { Hookified } from "hookified";
import Keyv, {
	type KeyvAny,
	type KeyvStorageAdapter,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import type { DatabaseError, PoolConfig } from "pg";
import { endPool, pool } from "./pool.js";
import type { KeyvPostgresOptions, Query } from "./types.js";

/**
 * Escapes a PostgreSQL identifier (table/schema name) to prevent SQL injection.
 * Uses double-quote escaping as per PostgreSQL standards.
 * @param {string} identifier - The table or schema name to escape.
 * @returns {string} The identifier wrapped in double quotes with internal quotes doubled.
 */
function escapeIdentifier(identifier: string): string {
	// Replace any double quotes with two double quotes (PostgreSQL escape sequence)
	// and wrap in double quotes
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Concurrent schema init can race on `CREATE INDEX IF NOT EXISTS`. These SQLSTATEs
 * mean the object already exists and are safe to ignore.
 * 23505 = unique_violation, 42P07 = duplicate_table, 42710 = duplicate_object.
 */
const ignorableInitErrorCodes = new Set(["23505", "42P07", "42710"]);

/**
 * Returns true when `expires` is a finite timestamp at or before `now`.
 * PostgreSQL `BIGINT` values may arrive as a string; coerce before comparing.
 * @param {unknown} expires - The stored expiry timestamp, or `null`/`undefined` for no expiry.
 * @param {number} now - The current Unix time in milliseconds.
 * @returns {boolean} `true` when the entry is expired.
 */
function isExpired(expires: unknown, now: number): boolean {
	if (expires === null || expires === undefined) {
		return false;
	}

	const timestamp = Number(expires);
	return Number.isFinite(timestamp) && timestamp <= now;
}

/**
 * PostgreSQL storage adapter for Keyv.
 *
 * Uses the `pg` library for connection pooling and parameterized queries.
 * Extends [Hookified](https://hookified.org) for event emission (`on`, `once`, `emit`)
 * and middleware hooks (`onHook`, `hook`). Connection and query failures emit `error`.
 *
 * @example
 * ```ts
 * import KeyvPostgres from "@keyv/postgres";
 * import Keyv from "keyv";
 *
 * const store = new KeyvPostgres("postgresql://user:pass@localhost:5432/dbname");
 * const keyv = new Keyv({ store });
 * store.on("error", (error) => {
 *   console.error(error);
 * });
 * ```
 */
export class KeyvPostgres extends Hookified implements KeyvStorageAdapter {
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
	 * The interval in milliseconds between automatic expired-entry cleanup runs.
	 * A value of 0 (default) disables the automatic cleanup.
	 * @default 0
	 */
	private _clearExpiredInterval = 0;

	/**
	 * The timer reference for the automatic expired-entry cleanup interval.
	 */
	private _clearExpiredTimer?: ReturnType<typeof setInterval>;

	/** Whether an automatic expired-entry cleanup is currently running. */
	private _clearExpiredRunning = false;

	/**
	 * Additional PoolConfig properties passed through to the pg connection pool.
	 */
	private _poolConfig: PoolConfig = {};

	/**
	 * Creates a new KeyvPostgres instance.
	 *
	 * Initializes the connection pool, creates the storage table (and schema) if they do
	 * not exist, and runs schema migrations for older tables (`namespace`, `expires`, unique
	 * index, partial expires index). Connection failures emit `error` rather than throwing
	 * from the constructor.
	 *
	 * @param {KeyvPostgresOptions | string} [options] - A PostgreSQL connection URI string
	 *   (e.g. `'postgresql://user:pass@localhost:5432/dbname'`) or a {@link KeyvPostgresOptions}
	 *   configuration object. Defaults to `'postgresql://localhost:5432'`.
	 */
	constructor(options?: KeyvPostgresOptions | string) {
		super({ throwOnEmptyListeners: false });

		if (typeof options === "string") {
			this._uri = options;
		} else if (options) {
			this.setOptions(options);
		}

		const schemaEsc = escapeIdentifier(this._schema);
		const tableEsc = escapeIdentifier(this._table);

		let createTable = `CREATE${this._useUnloggedTable ? " UNLOGGED " : " "}TABLE IF NOT EXISTS ${schemaEsc}.${tableEsc}(key VARCHAR(${Number(this._keyLength)}) NOT NULL, value TEXT, namespace VARCHAR(${Number(this._namespaceLength)}) DEFAULT NULL, expires BIGINT DEFAULT NULL)`;

		if (this._schema !== "public") {
			createTable = `CREATE SCHEMA IF NOT EXISTS ${schemaEsc}; ${createTable}`;
		}

		const migration = `ALTER TABLE ${schemaEsc}.${tableEsc} ADD COLUMN IF NOT EXISTS namespace VARCHAR(${Number(this._namespaceLength)}) DEFAULT NULL`;
		const migrationExpires = `ALTER TABLE ${schemaEsc}.${tableEsc} ADD COLUMN IF NOT EXISTS expires BIGINT DEFAULT NULL`;
		const dropOldPk = `ALTER TABLE ${schemaEsc}.${tableEsc} DROP CONSTRAINT IF EXISTS ${escapeIdentifier(`${this._table}_pkey`)}`;
		const createIndex = `CREATE UNIQUE INDEX IF NOT EXISTS ${escapeIdentifier(`${this._table}_key_namespace_idx`)} ON ${schemaEsc}.${tableEsc} (key, COALESCE(namespace, ''))`;
		const createExpiresIndex = `CREATE INDEX IF NOT EXISTS ${escapeIdentifier(`${this._table}_expires_idx`)} ON ${schemaEsc}.${tableEsc} (expires) WHERE expires IS NOT NULL`;

		this._connected = this.init(
			createTable,
			migration,
			migrationExpires,
			dropOldPk,
			createIndex,
			createExpiresIndex,
		)
			/* v8 ignore start -- @preserve */
			.catch((error) => {
				this.emit("error", error);
				throw error; // Re-throw so subsequent queries fail with a clear error
			});
		/* v8 ignore stop */

		this.query = async (sqlString: string, values?: KeyvAny) => {
			const query = await this._connected;
			return query(sqlString, values);
		};

		this.startClearExpiredTimer();
	}

	/**
	 * Declares the v6 absolute-`expires` storage contract via `capabilities.expires`.
	 * @returns {ReturnType<typeof keyvStorageCapability>} The adapter capability descriptor.
	 */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	/**
	 * Get the PostgreSQL connection URI.
	 * @returns {string} The PostgreSQL connection URI.
	 * @default 'postgresql://localhost:5432'
	 */
	public get uri(): string {
		return this._uri;
	}

	/**
	 * Set the PostgreSQL connection URI. Applied when the connection pool is created; changing
	 * this after construction does not reconnect.
	 * @param {string} value - The PostgreSQL connection URI.
	 */
	public set uri(value: string) {
		this._uri = value;
	}

	/**
	 * Get the table name used for storage.
	 * @returns {string} The table name.
	 * @default 'keyv'
	 */
	public get table(): string {
		return this._table;
	}

	/**
	 * Set the table name used for storage. Used at construction to create/migrate the table;
	 * changing it afterward retargets subsequent queries but does not create the new table.
	 * @param {string} value - The table name.
	 */
	public set table(value: string) {
		this._table = value;
	}

	/**
	 * Get the maximum key length (VARCHAR length) for the key column.
	 * @returns {number} The maximum key length.
	 * @default 255
	 */
	public get keyLength(): number {
		return this._keyLength;
	}

	/**
	 * Set the maximum key length (VARCHAR length) for the key column. Used when creating the table.
	 * @param {number} value - The maximum key length.
	 */
	public set keyLength(value: number) {
		this._keyLength = value;
	}

	/**
	 * Get the maximum namespace length (VARCHAR length) for the namespace column.
	 * @returns {number} The maximum namespace length.
	 * @default 255
	 */
	public get namespaceLength(): number {
		return this._namespaceLength;
	}

	/**
	 * Set the maximum namespace length (VARCHAR length) for the namespace column. Used when creating the table.
	 * @param {number} value - The maximum namespace length.
	 */
	public set namespaceLength(value: number) {
		this._namespaceLength = value;
	}

	/**
	 * Get the PostgreSQL schema name.
	 * @returns {string} The schema name.
	 * @default 'public'
	 */
	public get schema(): string {
		return this._schema;
	}

	/**
	 * Set the PostgreSQL schema name. Used at construction to create the schema/table;
	 * changing it afterward retargets subsequent queries but does not create the new schema.
	 * @param {string} value - The schema name.
	 */
	public set schema(value: string) {
		this._schema = value;
	}

	/**
	 * Get the SSL configuration for the PostgreSQL connection.
	 * @returns {boolean | ConnectionOptions | undefined} The SSL configuration, or `undefined` if unset.
	 * @default undefined
	 */
	public get ssl(): boolean | ConnectionOptions | undefined {
		return this._ssl;
	}

	/**
	 * Set the SSL configuration for the PostgreSQL connection. Applied when the pool is created;
	 * changing this after construction does not reconnect.
	 * @param {boolean | ConnectionOptions | undefined} value - The SSL configuration.
	 */
	public set ssl(value: boolean | ConnectionOptions | undefined) {
		this._ssl = value;
	}

	/**
	 * Get the number of rows to fetch per iteration batch.
	 * @returns {number} The iteration batch size.
	 * @default 10
	 */
	public get iterationLimit(): number {
		return this._iterationLimit;
	}

	/**
	 * Set the number of rows to fetch per iteration batch. Takes effect on the next {@link iterator} call.
	 * @param {number} value - The iteration batch size.
	 */
	public set iterationLimit(value: number) {
		this._iterationLimit = value;
	}

	/**
	 * Get whether to use a PostgreSQL unlogged table (faster writes, no WAL, data lost on crash).
	 * @returns {boolean} `true` if an unlogged table is requested.
	 * @default false
	 */
	public get useUnloggedTable(): boolean {
		return this._useUnloggedTable;
	}

	/**
	 * Set whether to use a PostgreSQL unlogged table. Used when creating the table.
	 * @param {boolean} value - `true` to request an unlogged table.
	 */
	public set useUnloggedTable(value: boolean) {
		this._useUnloggedTable = value;
	}

	/**
	 * Get the interval in milliseconds between automatic expired-entry cleanup runs.
	 * A value of 0 means the automatic cleanup is disabled.
	 * @returns {number} The cleanup interval in milliseconds.
	 * @default 0
	 */
	public get clearExpiredInterval(): number {
		return this._clearExpiredInterval;
	}

	/**
	 * Set the interval in milliseconds between automatic expired-entry cleanup runs.
	 * Setting to 0 disables the automatic cleanup. Takes effect immediately.
	 * @param {number} value - The cleanup interval in milliseconds (`0` to disable).
	 */
	public set clearExpiredInterval(value: number) {
		this._clearExpiredInterval = value;
		this.startClearExpiredTimer();
	}

	/**
	 * Get the namespace for the adapter. If `undefined`, no namespace prefix is applied
	 * and entries are stored under the default (`NULL`) namespace.
	 * @returns {string | undefined} The current namespace, or `undefined` if unset.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used by Keyv core for key prefixing and scoping
	 * operations like {@link clear} and {@link iterator}. Takes effect immediately.
	 * @param {string | undefined} value - The namespace to use, or `undefined` to disable namespacing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets a value by key. Expired entries are deleted on read and reported as missing.
	 *
	 * @template Value - The type of the stored value.
	 * @param {string} key - The key to retrieve. If a namespace is set, the namespace prefix is
	 * stripped before querying.
	 * @returns {Promise<KeyvStorageGetResult<Value>>} The stored value, or `undefined` if the key
	 * does not exist, has expired, or the stored value is SQL `NULL`. Never returns `null`.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const select = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(select, [strippedKey, ns]);
		const row = rows[0];
		if (row === undefined) {
			return undefined;
		}

		if (isExpired(row.expires, now)) {
			const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '')`;
			await this.query(del, [strippedKey, ns]);
			return undefined;
		}

		// Coerce a SQL NULL value to undefined so the adapter never returns null.
		return (row.value ?? undefined) as KeyvStorageGetResult<Value>;
	}

	/**
	 * Gets multiple values by their keys. Expired entries are deleted on read and reported as missing.
	 *
	 * @template Value - The type of the stored values.
	 * @param {string[]} keys - An array of keys to retrieve.
	 * @returns {Promise<Array<KeyvStorageGetResult<Value | undefined>>>} Values in the same order
	 * as `keys`. Missing, expired, and SQL `NULL` entries are `undefined` (never `null`).
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const getMany = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(getMany, [strippedKeys, ns]);

		const validMap = new Map<string, KeyvStorageGetResult<Value>>();
		const expiredKeys: string[] = [];
		for (const row of rows) {
			if (isExpired(row.expires, now)) {
				expiredKeys.push(row.key as string);
			} else {
				validMap.set(row.key as string, (row.value ?? undefined) as KeyvStorageGetResult<Value>);
			}
		}

		if (expiredKeys.length > 0) {
			const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '')`;
			await this.query(del, [expiredKeys, ns]);
		}

		return strippedKeys.map(
			(key) => (validMap.get(key) ?? undefined) as KeyvStorageGetResult<Value | undefined>,
		);
	}

	/**
	 * Sets a key-value pair. Uses an upsert operation via `ON CONFLICT` to insert or update.
	 * The absolute `expires` timestamp is stored in the `expires` column.
	 *
	 * @param {string} key - The key to set.
	 * @param {KeyvAny} value - The value to store (typically a serialized string from Keyv).
	 * @param {number} [expires] - Absolute expiry as Unix milliseconds since epoch. Omit or pass
	 * `undefined` for no expiry.
	 * @returns {Promise<boolean>} `true` on success, or `false` if an error occurred (an `error`
	 * event is also emitted).
	 */
	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		try {
			const strippedKey = this.removeKeyPrefix(key);
			const upsert = `INSERT INTO ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} (key, value, namespace, expires)
      VALUES($1, $2, $3, $4)
      ON CONFLICT(key, COALESCE(namespace, ''))
      DO UPDATE SET value=excluded.value, expires=excluded.expires;`;
			await this.query(upsert, [strippedKey, value, this.getNamespaceValue(), expires ?? null]);
			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Sets multiple key-value pairs at once using a single atomic PostgreSQL
	 * `INSERT ... UNNEST ... ON CONFLICT` statement for efficient bulk upserts.
	 *
	 * @template Value - The type of the stored values.
	 * @param {KeyvStorageEntry<Value>[]} entries - An array of key-value entry objects. Each
	 * entry may include an absolute `expires` timestamp in Unix milliseconds.
	 * @returns {Promise<boolean[] | undefined>} Booleans in the same order as `entries`. The
	 * statement is atomic: all entries succeed (`true`) or all fail (`false`). On failure an
	 * `error` event is emitted. An empty input returns `[]`.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return [];
		}

		try {
			const keys = [];
			const values = [];
			const expiresArray: Array<number | null> = [];
			for (const { key, value, expires } of entries) {
				keys.push(this.removeKeyPrefix(key));
				values.push(value);
				expiresArray.push(expires ?? null);
			}
			const upsert = `INSERT INTO ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} (key, value, namespace, expires)
      SELECT k, v, $3, e FROM UNNEST($1::text[], $2::text[], $4::bigint[]) AS t(k, v, e)
      ON CONFLICT(key, COALESCE(namespace, ''))
      DO UPDATE SET value=excluded.value, expires=excluded.expires;`;
			await this.query(upsert, [keys, values, this.getNamespaceValue(), expiresArray]);
			return entries.map(() => true);
		} catch (error) {
			this.emit("error", error);
			return entries.map(() => false);
		}
	}

	/**
	 * Deletes a key from the store.
	 *
	 * @param {string} key - The key to delete.
	 * @returns {Promise<boolean>} `true` if the key existed and was deleted, `false` otherwise.
	 */
	public async delete(key: string): Promise<boolean> {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '') RETURNING 1`;
		const rows = await this.query(del, [strippedKey, ns]);
		return rows.length > 0;
	}

	/**
	 * Deletes multiple keys from the store at once using a single
	 * `DELETE ... WHERE key = ANY($1) RETURNING key` statement.
	 *
	 * @param {string[]} keys - An array of keys to delete.
	 * @returns {Promise<boolean[]>} Booleans in the same order as `keys`, indicating whether each
	 * key existed and was deleted. An empty input returns `[]`.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '') RETURNING key`;
		const rows = await this.query(del, [strippedKeys, ns]);
		const deletedKeys = new Set(rows.map((row) => row.key as string));
		return strippedKeys.map((key) => deletedKeys.has(key));
	}

	/**
	 * Checks whether a key exists in the store. Expired entries are deleted on check
	 * and reported as missing.
	 *
	 * @param {string} key - The key to check.
	 * @returns {Promise<boolean>} `true` if the key exists and has not expired, `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const select = `SELECT expires FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(select, [strippedKey, ns]);
		if (rows.length === 0) {
			return false;
		}

		if (isExpired(rows[0].expires, now)) {
			const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = $1 AND COALESCE(namespace, '') = COALESCE($2, '')`;
			await this.query(del, [strippedKey, ns]);
			return false;
		}

		return true;
	}

	/**
	 * Checks whether multiple keys exist in the store. Expired entries are deleted on check
	 * and reported as missing.
	 *
	 * @param {string[]} keys - An array of keys to check.
	 * @returns {Promise<boolean[]>} Booleans in the same order as `keys`.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const select = `SELECT key, expires FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '')`;
		const rows = await this.query(select, [strippedKeys, ns]);

		const validKeys = new Set<string>();
		const expiredKeys: string[] = [];
		for (const row of rows) {
			if (isExpired(row.expires, now)) {
				expiredKeys.push(row.key as string);
			} else {
				validKeys.add(row.key as string);
			}
		}

		if (expiredKeys.length > 0) {
			const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE key = ANY($1) AND COALESCE(namespace, '') = COALESCE($2, '')`;
			await this.query(del, [expiredKeys, ns]);
		}

		return strippedKeys.map((key) => validKeys.has(key));
	}

	/**
	 * Clears all keys in the current namespace. If no namespace is set, only keys without a
	 * namespace (the default namespace) are removed.
	 *
	 * @returns {Promise<void>} Resolves once the matching keys have been deleted.
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
	 * Deletes all expired entries from the store where the `expires` column is set and less
	 * than or equal to the current timestamp. Called automatically when
	 * {@link clearExpiredInterval} is set to a positive value.
	 *
	 * @returns {Promise<void>} Resolves once expired entries have been deleted.
	 */
	public async clearExpired(): Promise<void> {
		const del = `DELETE FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE expires IS NOT NULL AND expires <= $1`;
		await this.query(del, [Date.now()]);
	}

	/**
	 * Iterates over all key-value pairs scoped to the namespace configured on the instance.
	 * The namespace does not need to be passed in — it is read from the {@link namespace} property.
	 * Uses cursor-based (keyset) pagination with batch size controlled by {@link iterationLimit},
	 * which handles concurrent deletions during iteration without skipping entries.
	 *
	 * @yields {[string, string | undefined]} A `[key, value]` tuple for each non-expired entry.
	 * A SQL `NULL` value is yielded as `undefined` (never `null`).
	 * @returns {AsyncGenerator<[string, string | undefined], void, unknown>} An async generator of
	 * `[key, value]` tuples.
	 */
	public async *iterator(): AsyncGenerator<[string, string | undefined], void, unknown> {
		const limit = Number.parseInt(String(this._iterationLimit), 10) || 10;
		const namespaceValue = this.getNamespaceValue() || null;

		// Use keyset pagination (cursor-based) instead of OFFSET to handle
		// concurrent deletions during iteration without skipping entries
		let lastKey: string | null = null;

		while (true) {
			let entries: Array<{ key: string; value: string | null }>;

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

				where.push(`(expires IS NULL OR expires > $${params.length + 1})`);
				params.push(Date.now());

				const select = `SELECT * FROM ${escapeIdentifier(this._schema)}.${escapeIdentifier(this._table)} WHERE ${where.join(" AND ")} ORDER BY key LIMIT $${params.length + 1}`;
				params.push(limit);

				entries = await this.query(select, params);
				/* v8 ignore start -- @preserve */
			} catch (error) {
				this.emit(
					"error",
					new Error(`Iterator failed at cursor ${lastKey ?? "start"}: ${(error as Error).message}`),
				);
				return;
			}
			/* v8 ignore stop */

			/* v8 ignore next -- @preserve */
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				/* v8 ignore next -- @preserve */
				if (entry.key !== undefined && entry.key !== null) {
					yield [entry.key, entry.value ?? undefined];
				}
			}

			lastKey = entries[entries.length - 1].key;

			if (entries.length < limit) {
				return;
			}
		}
	}

	/**
	 * Disconnects from the PostgreSQL database and releases this instance's pool reference.
	 * Also stops the automatic expired-entry cleanup interval if running. The underlying
	 * `pg.Pool` is closed only when the last adapter sharing it disconnects.
	 *
	 * @returns {Promise<void>} Resolves once this instance's pool reference has been released.
	 */
	public async disconnect(): Promise<void> {
		this.stopClearExpiredTimer();
		await endPool(this._uri, { ...this._poolConfig, ssl: this._ssl });
	}

	/**
	 * Initializes the database connection and ensures the table schema exists.
	 * Called from the constructor; errors are emitted rather than thrown, except for
	 * ignorable race codes (`23505`, `42P07`, `42710`) from concurrent `CREATE INDEX`.
	 *
	 * @param {string} createTable - SQL that creates the storage table (and schema if needed).
	 * @param {string} migration - SQL that adds the `namespace` column to legacy tables.
	 * @param {string} migrationExpires - SQL that adds the `expires` column to legacy tables.
	 * @param {string} dropOldPk - SQL that drops the legacy single-column primary key.
	 * @param {string} createIndex - SQL that creates the unique `(key, namespace)` index.
	 * @param {string} createExpiresIndex - SQL that creates the partial index on `expires`.
	 * @returns {Promise<Query>} The query function once initialization completes.
	 */
	private async init(
		createTable: string,
		migration: string,
		migrationExpires: string,
		dropOldPk: string,
		createIndex: string,
		createExpiresIndex: string,
	): Promise<Query> {
		const query = await this.connect();

		try {
			await query(createTable);
			await query(migration);
			await query(migrationExpires);
			await query(dropOldPk);
			await query(createIndex);
			await query(createExpiresIndex);
		} catch (error) {
			/* v8 ignore next -- @preserve */
			if (!ignorableInitErrorCodes.has((error as DatabaseError).code ?? "")) {
				this.emit("error", error);
			}
		}

		return query;
	}

	/**
	 * Establishes a connection to the PostgreSQL database via the connection pool.
	 *
	 * @returns {Promise<Query>} A query function that executes SQL statements and returns result rows.
	 */
	private async connect(): Promise<Query> {
		const conn = pool(this._uri, { ...this._poolConfig, ssl: this._ssl });
		return async (sql: string, values?: KeyvAny) => {
			const data = await conn.query(sql, values);
			return data.rows;
		};
	}

	/**
	 * Strips the namespace prefix from a key that was added by the Keyv core.
	 * For example, if namespace is `'ns'` and key is `'ns:foo'`, returns `'foo'`.
	 * If no namespace is set or the key does not start with the expected prefix,
	 * the key is returned unchanged.
	 *
	 * @param {string} key - The potentially prefixed key.
	 * @returns {string} The key without the namespace prefix.
	 */
	private removeKeyPrefix(key: string): string {
		if (this._namespace && key.startsWith(`${this._namespace}:`)) {
			return key.slice(this._namespace.length + 1);
		}

		return key;
	}

	/**
	 * Returns the namespace value for SQL parameters. PostgreSQL stores the default
	 * namespace as SQL `NULL`, so this returns `null` when no namespace is set.
	 *
	 * @returns {string | null} The current namespace, or `null` if unset.
	 */
	private getNamespaceValue(): string | null {
		return this._namespace ?? null;
	}

	/**
	 * Starts (or restarts) the automatic expired-entry cleanup interval.
	 * If the interval is `0` or negative, any existing timer is stopped.
	 * The timer is unreffed so it does not prevent the Node.js process from exiting.
	 *
	 * @returns {void}
	 */
	private startClearExpiredTimer(): void {
		this.stopClearExpiredTimer();
		if (this._clearExpiredInterval > 0) {
			this._clearExpiredTimer = setInterval(async () => {
				if (this._clearExpiredRunning) {
					return;
				}

				this._clearExpiredRunning = true;
				try {
					await this.clearExpired();
				} catch (error) {
					/* v8 ignore next -- @preserve */
					this.emit("error", error);
				} finally {
					this._clearExpiredRunning = false;
				}
			}, this._clearExpiredInterval);
			this._clearExpiredTimer.unref();
		}
	}

	/**
	 * Stops the automatic expired-entry cleanup interval if running
	 * and clears the timer reference.
	 *
	 * @returns {void}
	 */
	private stopClearExpiredTimer(): void {
		if (this._clearExpiredTimer) {
			clearInterval(this._clearExpiredTimer);
			this._clearExpiredTimer = undefined;
		}
	}

	/**
	 * Applies a {@link KeyvPostgresOptions} object to the instance, assigning known adapter
	 * options and forwarding any remaining properties to the underlying pg `PoolConfig`.
	 * Only properties that are explicitly defined (not `undefined`) are updated.
	 *
	 * @param {KeyvPostgresOptions} options - The options object to apply.
	 * @returns {void}
	 */
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

		if (options.clearExpiredInterval !== undefined) {
			this._clearExpiredInterval = options.clearExpiredInterval;
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
			clearExpiredInterval,
			...poolConfigRest
		} = options;

		this._poolConfig = { ...this._poolConfig, ...poolConfigRest };
	}
}

/**
 * Helper function to create a Keyv instance with KeyvPostgres as the storage adapter.
 *
 * @param {KeyvPostgresOptions | string} [options] - Optional {@link KeyvPostgresOptions}
 *   configuration object or a PostgreSQL connection URI string.
 * @returns {Keyv} A new Keyv instance backed by PostgreSQL.
 */
export const createKeyv = (options?: KeyvPostgresOptions | string) =>
	new Keyv({ store: new KeyvPostgres(options) });

export default KeyvPostgres;
export type { KeyvPostgresOptions } from "./types.js";
