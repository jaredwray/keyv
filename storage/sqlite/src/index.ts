import { Hookified } from "hookified";
import Keyv, { type KeyvEntry, type KeyvStorageAdapter, type StoredData } from "keyv";
import { resolveDriver } from "./drivers/index.js";
import type { SqliteDriver, SqliteDriverName } from "./drivers/types.js";
import type { Db, DbClose, DbQuery, KeyvSqliteOptions } from "./types.js";

/**
 * Sanitizes a table name for safe use in SQL statements.
 * Strips all non-alphanumeric characters (except underscores) and ensures
 * the name starts with a letter (prepends `_` if it starts with a digit).
 * @param input - The raw table name to sanitize.
 * @returns The sanitized table name.
 * @throws If the sanitized result is empty (input contained only special characters).
 */
const toTableString = (input: string) => {
	const sanitized = String(input).replace(/[^a-zA-Z0-9_]/g, "");
	if (sanitized.length === 0) {
		throw new Error("Invalid table name: must contain alphanumeric characters");
	}
	return /^[a-zA-Z]/.test(sanitized) ? sanitized : `_${sanitized}`;
};

/**
 * Escapes a SQL identifier (table/index name) to prevent SQL injection.
 * Uses double-quote escaping as per the SQL standard supported by SQLite.
 * @param identifier - The raw identifier to escape.
 * @returns The escaped identifier wrapped in double quotes.
 */
function escapeIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * SQLite storage adapter for Keyv.
 *
 * Supports multiple drivers (`better-sqlite3`, `node:sqlite`, `bun:sqlite`) with
 * automatic runtime detection. Stores key-value pairs in a SQLite table with
 * dedicated `namespace` and `expires` columns for efficient multi-tenant
 * separation and TTL-based expiration.
 *
 * @example
 * ```ts
 * import KeyvSqlite from '@keyv/sqlite';
 * import Keyv from 'keyv';
 *
 * const store = new KeyvSqlite('sqlite://path/to/db.sqlite');
 * const keyv = new Keyv({ store });
 * ```
 */
export class KeyvSqlite extends Hookified implements KeyvStorageAdapter {
	/** The namespace used to prefix keys for multi-tenant separation. */
	private _namespace?: string;

	/**
	 * The SQLite connection URI.
	 * @default 'sqlite://:memory:'
	 */
	private _uri = "sqlite://:memory:";

	/**
	 * The table name used for storage.
	 * @default 'keyv'
	 */
	private _table = "keyv";

	/**
	 * The maximum key length (VARCHAR length) for the key column.
	 * @default 255
	 */
	private _keySize = 255;

	/**
	 * The maximum namespace length (VARCHAR length) for the namespace column.
	 * @default 255
	 */
	private _namespaceLength = 255;

	/**
	 * The resolved file path for the SQLite database, derived from the URI.
	 * @default ':memory:'
	 */
	private _db = ":memory:";

	/**
	 * The SQLite busy timeout in milliseconds. Controls how long SQLite waits
	 * when the database is locked by another connection.
	 */
	private _busyTimeout?: number;

	/**
	 * The number of rows to fetch per iteration batch.
	 * @default 10
	 */
	private _iterationLimit = 10;

	/**
	 * Whether WAL (Write-Ahead Logging) mode is enabled for improved concurrency.
	 * Not supported for in-memory databases.
	 * @default false
	 */
	private _wal = false;

	/**
	 * The explicit driver selection. If omitted, auto-detection is used.
	 */
	private _driver?: SqliteDriverName | SqliteDriver;

	/**
	 * The interval in milliseconds between automatic expired-entry cleanup runs.
	 * A value of 0 (default) disables the automatic cleanup.
	 * @default 0
	 */
	private _clearExpiredInterval = 0;

	/** The timer reference for the automatic expired-entry cleanup interval. */
	private _clearExpiredTimer?: ReturnType<typeof setInterval>;

	/** The resolved driver name, populated after connection. */
	private _resolvedDriverName?: string;

	/** Promise-based function to close the database connection. */
	close: DbClose;

	/** Promise-based function to execute SQL queries against the database. */
	query: DbQuery;

	/**
	 * A promise that resolves when the database connection and schema setup
	 * are complete. Useful for awaiting initialization before first use.
	 */
	public readonly ready: Promise<void>;

	/**
	 * Creates a new KeyvSqlite instance.
	 *
	 * Initializes the database connection, creates the storage table if it does
	 * not exist, and runs any necessary schema migrations for older databases.
	 *
	 * @param keyvOptions - A SQLite connection URI string (e.g. `'sqlite://path/to/db.sqlite'`)
	 *   or a {@link KeyvSqliteOptions} configuration object. Defaults to an in-memory database.
	 * @throws If `keySize` is not a finite positive number between 1 and 65535.
	 * @throws If the table name contains no alphanumeric characters after sanitization.
	 */
	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super({ throwOnEmptyListeners: false });

		if (typeof keyvOptions === "string") {
			this._uri = keyvOptions;
		} else if (keyvOptions) {
			this.setOptions(keyvOptions);
		}

		this._db = this._uri.replace(/^sqlite:\/\//, "");
		this._table = toTableString(this._table);

		const keySize = Number(this._keySize);
		if (!Number.isFinite(keySize) || keySize <= 0 || keySize > 65535) {
			throw new Error("Invalid keySize: must be a positive number between 1 and 65535");
		}

		const createTable = `CREATE TABLE IF NOT EXISTS ${this.getCleanTableName()}(key VARCHAR(${keySize}) NOT NULL, value TEXT, namespace VARCHAR(${Number(this._namespaceLength)}) NOT NULL DEFAULT '', expires BIGINT DEFAULT NULL, UNIQUE(key, namespace))`;
		const createExpiresIndex = `CREATE INDEX IF NOT EXISTS ${escapeIdentifier(`${this._table}_expires_idx`)} ON ${this.getCleanTableName()} (expires) WHERE expires IS NOT NULL`;

		const connected: Promise<Db> = this.createConnection()
			.then(async (database) => {
				// Check if table exists and needs migration
				const tableInfo = await database.query(`PRAGMA table_info(${this.getCleanTableName()})`);

				if (tableInfo.length === 0) {
					// Table doesn't exist — create with new schema
					await database.query(createTable);
				} else {
					// Table exists — check if migration is needed
					const columnNames = (tableInfo as Array<{ name: string }>).map((c) => c.name);
					if (!columnNames.includes("namespace")) {
						// Old schema detected — migrate by recreating table
						// Old keys are stored as "namespace:actualKey" (e.g. "keyv:foo").
						// Split them so the new schema stores key and namespace separately.
						const oldTable = escapeIdentifier(`${this._table}_migration_old`);
						const newTable = this.getCleanTableName();
						await database.query(`ALTER TABLE ${newTable} RENAME TO ${oldTable}`);
						await database.query(createTable);
						await database.query(
							`INSERT OR IGNORE INTO ${newTable} (key, value, namespace) SELECT CASE WHEN INSTR(key, ':') > 0 THEN SUBSTR(key, INSTR(key, ':') + 1) ELSE key END, value, CASE WHEN INSTR(key, ':') > 0 THEN SUBSTR(key, 1, INSTR(key, ':') - 1) ELSE '' END FROM ${oldTable}`,
						);
						await database.query(`DROP TABLE ${oldTable}`);
					} else if (!columnNames.includes("expires")) {
						// Has namespace but missing expires — add column
						await database.query(
							`ALTER TABLE ${this.getCleanTableName()} ADD COLUMN expires BIGINT DEFAULT NULL`,
						);
					}
				}

				await database.query(createExpiresIndex);
				return database as Db;
			})
			/* v8 ignore next -- @preserve */
			.catch((error) => {
				/* v8 ignore next -- @preserve */
				this.emit("error", error);
				/* v8 ignore next -- @preserve */
				throw error;
			});

		// Suppress unhandled-rejection on the base promise. Connection errors
		// are still surfaced through this.query, this.close, and this.ready
		// when those are awaited, and via the 'error' event emitted above.
		connected.catch(() => {});

		this.query = async (sqlString, ...parameter) =>
			connected.then(async (database) => database.query(sqlString, ...parameter));

		this.close = async () => connected.then((database) => database.close());

		this.ready = connected.then(() => {});
		// Suppress unhandled-rejection when callers never await ready
		this.ready.catch(() => {});

		this.startClearExpiredTimer();
	}

	/**
	 * Get the namespace for the adapter. If `undefined`, no namespace prefix is applied
	 * and entries are stored under the default (empty) namespace.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used by Keyv core for key prefixing
	 * and scoping operations like {@link clear} and {@link iterator}.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the SQLite connection URI.
	 * @default 'sqlite://:memory:'
	 */
	public get uri(): string {
		return this._uri;
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
	 * The name is sanitized to prevent SQL injection.
	 */
	public set table(value: string) {
		this._table = toTableString(value);
	}

	/**
	 * Get the maximum key length (VARCHAR length) for the key column.
	 * @default 255
	 */
	public get keySize(): number {
		return this._keySize;
	}

	/**
	 * Set the maximum key length (VARCHAR length) for the key column.
	 */
	public set keySize(value: number) {
		this._keySize = value;
	}

	/**
	 * Alias for `keySize`. Returns the maximum key length.
	 */
	public get keyLength(): number {
		return this._keySize;
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
	 * Get the resolved file path for the SQLite database, derived from the URI.
	 * @default ':memory:'
	 */
	public get db(): string {
		return this._db;
	}

	/**
	 * Get the number of rows to fetch per iteration batch.
	 * @default 10
	 */
	public get iterationLimit(): number {
		return this._iterationLimit;
	}

	/**
	 * Set the number of rows to fetch per iteration batch. Must be a positive integer.
	 */
	public set iterationLimit(value: number) {
		/* v8 ignore next 3 -- @preserve: validation guard */
		if (!Number.isInteger(value) || value < 1) {
			throw new RangeError("iterationLimit must be a positive integer");
		}

		this._iterationLimit = value;
	}

	/**
	 * Get whether WAL (Write-Ahead Logging) mode is enabled.
	 * @default false
	 */
	public get wal(): boolean {
		return this._wal;
	}

	/**
	 * Get the SQLite busy timeout in milliseconds.
	 */
	public get busyTimeout(): number | undefined {
		return this._busyTimeout;
	}

	/**
	 * Get the explicit driver selection. Returns `undefined` if auto-detected.
	 */
	public get driver(): SqliteDriverName | SqliteDriver | undefined {
		return this._driver;
	}

	/**
	 * Get the name of the resolved SQLite driver (e.g. `"better-sqlite3"`, `"node:sqlite"`).
	 * Available after the connection has been established (await {@link ready} first).
	 */
	public get driverName(): string | undefined {
		return this._resolvedDriverName;
	}

	/**
	 * Get the interval in milliseconds between automatic expired-entry cleanup runs.
	 * A value of `0` means the automatic cleanup is disabled.
	 * @default 0
	 */
	public get clearExpiredInterval(): number {
		return this._clearExpiredInterval;
	}

	/**
	 * Set the interval in milliseconds between automatic expired-entry cleanup runs.
	 * Setting to `0` disables the automatic cleanup. Any existing timer is stopped
	 * and restarted with the new interval.
	 */
	public set clearExpiredInterval(value: number) {
		this._clearExpiredInterval = value;
		this.startClearExpiredTimer();
	}

	/**
	 * Gets a value by key from the store.
	 * @param key - The key to retrieve. If a namespace is set, the namespace prefix is stripped before querying.
	 * @returns The value associated with the key, or `undefined` if the key does not exist.
	 */
	async get<Value>(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const select = `SELECT * FROM ${this.getCleanTableName()} WHERE key = ? AND namespace = ?`;
		const rows = await this.query(select, strippedKey, ns);
		const row = rows[0] as { value: Value; expires?: number | null } | undefined;
		if (row === undefined) {
			return undefined;
		}

		if (row.expires !== null && row.expires !== undefined && row.expires <= now) {
			const del = `DELETE FROM ${this.getCleanTableName()} WHERE key = ? AND namespace = ?`;
			await this.query(del, strippedKey, ns);
			return undefined;
		}

		return row.value;
	}

	/**
	 * Gets multiple values by their keys using parameterized `IN (?, ?)` queries.
	 * @param keys - An array of keys to retrieve.
	 * @returns An array of values in the same order as the input keys,
	 *   with `undefined` for any keys that do not exist.
	 */
	async getMany<Value>(keys: string[]) {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const batchSize = 998; // 999 max params - 1 for namespace
		const validMap = new Map<string, Value>();

		for (let i = 0; i < strippedKeys.length; i += batchSize) {
			const batch = strippedKeys.slice(i, i + batchSize);
			const placeholders = batch.map(() => "?").join(", ");
			const select = `SELECT * FROM ${this.getCleanTableName()} WHERE key IN (${placeholders}) AND namespace = ?`;
			const rows = await this.query(select, ...batch, ns);
			const expiredKeys: string[] = [];
			for (const row of rows as Array<{ key: string; value: Value; expires?: number | null }>) {
				if (row.expires !== null && row.expires !== undefined && row.expires <= now) {
					expiredKeys.push(row.key);
				} else {
					validMap.set(row.key, row.value);
				}
			}

			if (expiredKeys.length > 0) {
				const expiredPlaceholders = expiredKeys.map(() => "?").join(", ");
				const del = `DELETE FROM ${this.getCleanTableName()} WHERE key IN (${expiredPlaceholders}) AND namespace = ?`;
				await this.query(del, ...expiredKeys, ns);
			}
		}

		return strippedKeys.map(
			(key) => (validMap.get(key) ?? undefined) as StoredData<Value | undefined>,
		);
	}

	/**
	 * Sets a key-value pair. Uses an upsert operation via `ON CONFLICT` to
	 * insert a new entry or update an existing one atomically. Automatically
	 * extracts the `expires` timestamp from the serialized value if present.
	 * @param key - The key to set. If a namespace is set, the namespace prefix is stripped before storing.
	 * @param value - The value to store. May be a serialized JSON string containing an `expires` timestamp.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any): Promise<boolean> {
		try {
			const strippedKey = this.removeKeyPrefix(key);
			const ns = this.getNamespaceValue();
			const expires = this.getExpiresFromValue(value);
			const upsert = `INSERT INTO ${this.getCleanTableName()} (key, value, namespace, expires)
			VALUES(?, ?, ?, ?)
			ON CONFLICT(key, namespace)
			DO UPDATE SET value=excluded.value, expires=excluded.expires;`;
			await this.query(upsert, strippedKey, value, ns, expires);
			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Sets multiple key-value pairs at once using a multi-row `INSERT ... ON CONFLICT` statement.
	 * More efficient than calling {@link set} in a loop for bulk operations.
	 * @param entries - An array of `{ key, value }` entry objects to store.
	 */
	async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return entries.map(() => true);
		}

		// Each entry uses 4 parameters. SQLite defaults to a max of 999 bind
		// parameters (SQLITE_MAX_VARIABLE_NUMBER), so batch to stay under that.
		const batchSize = 249; // floor(999 / 4)
		const ns = this.getNamespaceValue();
		const results = new Array<boolean>(entries.length).fill(false);

		for (let i = 0; i < entries.length; i += batchSize) {
			const batch = entries.slice(i, i + batchSize);
			const placeholders: string[] = [];
			// biome-ignore lint/suspicious/noExplicitAny: type format
			const params: any[] = [];

			for (const { key, value } of batch) {
				const strippedKey = this.removeKeyPrefix(key);
				const expires = this.getExpiresFromValue(value);
				placeholders.push("(?, ?, ?, ?)");
				params.push(strippedKey, value, ns, expires);
			}

			const upsert = `INSERT INTO ${this.getCleanTableName()} (key, value, namespace, expires)
			VALUES ${placeholders.join(", ")}
			ON CONFLICT(key, namespace)
			DO UPDATE SET value=excluded.value, expires=excluded.expires;`;
			try {
				await this.query(upsert, ...params);
				for (let j = i; j < i + batch.length; j++) {
					results[j] = true;
				}
			} catch (error) {
				this.emit("error", error);
			}
		}

		return results;
	}

	/**
	 * Deletes a key from the store.
	 * @param key - The key to delete.
	 * @returns `true` if the key existed and was deleted, `false` if the key was not found.
	 */
	async delete(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const del = `DELETE FROM ${this.getCleanTableName()} WHERE key = ? AND namespace = ? RETURNING key`;
		const result = (await this.query(del, strippedKey, ns)) as Array<{
			key: string;
		}>;
		return result.length > 0;
	}

	/**
	 * Deletes multiple keys from the store by deleting each key individually.
	 * @param keys - An array of keys to delete.
	 * @returns An array of booleans in the same order as the input keys,
	 *   where `true` indicates the key existed and was deleted, `false` indicates it was not found.
	 */
	async deleteMany(keys: string[]): Promise<boolean[]> {
		const results: boolean[] = [];
		for (const key of keys) {
			results.push(await this.delete(key));
		}

		return results;
	}

	/**
	 * Clears all keys in the current namespace. If no namespace is set,
	 * all entries with an empty namespace are removed.
	 */
	async clear() {
		const del = `DELETE FROM ${this.getCleanTableName()} WHERE namespace = ?`;
		await this.query(del, this.getNamespaceValue());
	}

	/**
	 * Checks whether a key exists in the store.
	 * @param key - The key to check.
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	async has(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const select = `SELECT expires FROM ${this.getCleanTableName()} WHERE key = ? AND namespace = ?`;
		const rows = (await this.query(select, strippedKey, ns)) as Array<{ expires?: number | null }>;
		if (rows.length === 0) {
			return false;
		}

		if (rows[0].expires !== null && rows[0].expires !== undefined && rows[0].expires <= now) {
			const del = `DELETE FROM ${this.getCleanTableName()} WHERE key = ? AND namespace = ?`;
			await this.query(del, strippedKey, ns);
			return false;
		}

		return true;
	}

	/**
	 * Checks whether multiple keys exist in the store using parameterized `IN (?, ?)` queries.
	 * @param keys - An array of keys to check.
	 * @returns An array of booleans in the same order as the input keys,
	 *   where `true` indicates the key exists and `false` indicates it does not.
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const batchSize = 998; // 999 max params - 1 for namespace
		const validKeys = new Set<string>();

		for (let i = 0; i < strippedKeys.length; i += batchSize) {
			const batch = strippedKeys.slice(i, i + batchSize);
			const placeholders = batch.map(() => "?").join(", ");
			const select = `SELECT key, expires FROM ${this.getCleanTableName()} WHERE key IN (${placeholders}) AND namespace = ?`;
			const rows = await this.query(select, ...batch, ns);
			const expiredKeys: string[] = [];
			for (const row of rows as Array<{ key: string; expires?: number | null }>) {
				if (row.expires !== null && row.expires !== undefined && row.expires <= now) {
					expiredKeys.push(row.key);
				} else {
					validKeys.add(row.key);
				}
			}

			if (expiredKeys.length > 0) {
				const expiredPlaceholders = expiredKeys.map(() => "?").join(", ");
				const del = `DELETE FROM ${this.getCleanTableName()} WHERE key IN (${expiredPlaceholders}) AND namespace = ?`;
				await this.query(del, ...expiredKeys, ns);
			}
		}

		return strippedKeys.map((key) => validKeys.has(key));
	}

	/**
	 * Deletes all expired entries from the store where the `expires` column
	 * is less than the current timestamp. This is called automatically when
	 * {@link clearExpiredInterval} is set to a positive value.
	 */
	async clearExpired(): Promise<void> {
		const del = `DELETE FROM ${this.getCleanTableName()} WHERE expires IS NOT NULL AND expires < ?`;
		await this.query(del, Date.now());
	}

	/**
	 * Iterates over all key-value pairs, optionally filtered by namespace.
	 * Uses cursor-based (keyset) pagination with batch size controlled by `iterationLimit`
	 * to safely handle concurrent modifications without skipping entries.
	 * @yields A `[key, value]` tuple for each entry.
	 */
	async *iterator() {
		const limit = this._iterationLimit > 0 ? this._iterationLimit : 10;
		const ns = this.getNamespaceValue();
		let lastKey: string | null = null;

		while (true) {
			let entries: Array<{ key: string; value: string }>;

			try {
				let select: string;
				// biome-ignore lint/suspicious/noExplicitAny: type format
				let params: any[];

				if (lastKey !== null) {
					select = `SELECT * FROM ${this.getCleanTableName()} WHERE namespace = ? AND key > ? AND (expires IS NULL OR expires > ?) ORDER BY key LIMIT ?`;
					params = [ns, lastKey, Date.now(), limit];
				} else {
					select = `SELECT * FROM ${this.getCleanTableName()} WHERE namespace = ? AND (expires IS NULL OR expires > ?) ORDER BY key LIMIT ?`;
					params = [ns, Date.now(), limit];
				}

				entries = (await this.query(select, ...params)) as Array<{
					key: string;
					value: string;
				}>;
				/* v8 ignore start -- @preserve */
			} catch (error) {
				this.emit(
					"error",
					new Error(`Iterator failed at cursor ${lastKey ?? "start"}: ${(error as Error).message}`),
				);
				return;
			}
			/* v8 ignore stop */

			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				yield [entry.key, entry.value];
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
	 * Disconnects from the SQLite database and releases resources.
	 * Stops the automatic expired-entry cleanup interval if running,
	 * then closes the underlying database connection. Must be called
	 * before process exit to avoid hanging connections.
	 */
	async disconnect() {
		this.stopClearExpiredTimer();
		await this.close();
	}

	/**
	 * Returns the escaped table name for use in SQL statements.
	 */
	private getCleanTableName(): string {
		return escapeIdentifier(this._table);
	}

	/**
	 * Creates a new SQLite database connection using the resolved driver.
	 * The driver handles busy timeout, WAL mode, and connection setup.
	 * @returns An object with `query` and `close` functions for database operations.
	 */
	private async createConnection(): Promise<Db> {
		const driver = await resolveDriver(this._driver);
		this._resolvedDriverName = driver.name;
		return driver.connect({
			filename: this._db,
			busyTimeout: this._busyTimeout,
			wal: this._wal,
		});
	}

	/**
	 * Strips the namespace prefix from a key that was added by the Keyv core.
	 * For example, if namespace is `'ns'` and key is `'ns:foo'`, returns `'foo'`.
	 * If no namespace is set or the key does not start with the expected prefix,
	 * the key is returned unchanged.
	 * @param key - The potentially prefixed key.
	 * @returns The key without the namespace prefix.
	 */
	private removeKeyPrefix(key: string): string {
		if (this._namespace && key.startsWith(`${this._namespace}:`)) {
			return key.slice(this._namespace.length + 1);
		}

		return key;
	}

	/**
	 * Returns the namespace value for use in SQL query parameters.
	 * Returns an empty string when no namespace is set, matching the
	 * `NOT NULL DEFAULT ''` column constraint.
	 * @returns The current namespace string, or `''` if unset.
	 */
	private getNamespaceValue(): string {
		return this._namespace ?? "";
	}

	/**
	 * Extracts the `expires` timestamp from a serialized value.
	 *
	 * The Keyv core serializes data as JSON like `{"value":"...","expires":1234567890}`.
	 * This method parses that JSON (or inspects the object directly if the value
	 * is not a string) and returns the `expires` field if present.
	 *
	 * @param value - The serialized value string or object to inspect.
	 * @returns The expires timestamp as a number, or `null` if not present or not parseable.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	private getExpiresFromValue(value: any): number | null {
		// biome-ignore lint/suspicious/noExplicitAny: type format
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
	 * Starts (or restarts) the automatic expired-entry cleanup interval.
	 * If the interval is `0` or negative, any existing timer is stopped.
	 * The timer is unreffed so it does not prevent the Node.js process from exiting.
	 */
	private startClearExpiredTimer(): void {
		this.stopClearExpiredTimer();
		if (this._clearExpiredInterval > 0) {
			this._clearExpiredTimer = setInterval(async () => {
				try {
					await this.clearExpired();
				} catch (error) {
					/* v8 ignore next -- @preserve */
					this.emit("error", error);
				}
			}, this._clearExpiredInterval);
			this._clearExpiredTimer.unref();
		}
	}

	/**
	 * Stops the automatic expired-entry cleanup interval if running
	 * and clears the timer reference.
	 */
	private stopClearExpiredTimer(): void {
		if (this._clearExpiredTimer) {
			clearInterval(this._clearExpiredTimer);
			this._clearExpiredTimer = undefined;
		}
	}

	/**
	 * Applies configuration options from a partial {@link KeyvSqliteOptions} object.
	 * Only properties that are explicitly defined (not `undefined`) are updated.
	 * The `keyLength` property is treated as an alias for `keySize`.
	 * @param options - The options to apply.
	 */
	private setOptions(options: KeyvSqliteOptions): void {
		if (options.uri !== undefined) {
			this._uri = options.uri;
		}

		if (options.table !== undefined) {
			this._table = options.table;
		}

		if (options.keySize !== undefined) {
			this._keySize = options.keySize;
		}

		if (options.keyLength !== undefined) {
			this._keySize = options.keyLength;
		}

		if (options.namespaceLength !== undefined) {
			this._namespaceLength = options.namespaceLength;
		}

		if (options.busyTimeout !== undefined) {
			this._busyTimeout = options.busyTimeout;
		}

		if (options.iterationLimit !== undefined) {
			this._iterationLimit = options.iterationLimit;
		}

		if (options.wal !== undefined) {
			this._wal = options.wal;
		}

		if (options.clearExpiredInterval !== undefined) {
			this._clearExpiredInterval = options.clearExpiredInterval;
		}

		if (options.driver !== undefined) {
			this._driver = options.driver;
		}
	}
}

/**
 * Helper function to create a Keyv instance with KeyvSqlite as the storage adapter.
 * @param keyvOptions - Optional {@link KeyvSqliteOptions} configuration object or URI string.
 * @returns A new Keyv instance backed by SQLite.
 */
export const createKeyv = (keyvOptions?: KeyvSqliteOptions | string) =>
	new Keyv({ store: new KeyvSqlite(keyvOptions) });

export default KeyvSqlite;
export type {
	Sqlite3DatabaseLike,
	Sqlite3ModuleLike,
} from "./drivers/sqlite3-driver.js";
export { createSqlite3Driver } from "./drivers/sqlite3-driver.js";
export type { SqliteDriver, SqliteDriverName } from "./drivers/types";
export type { KeyvSqliteOptions } from "./types";
