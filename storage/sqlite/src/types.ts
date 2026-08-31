import type { SqliteDriver, SqliteDriverName } from "./drivers/types.js";

/**
 * Executes a SQL statement and returns result rows.
 * @param {string} sqlString - The SQL statement to execute.
 * @param {...unknown} parameter - Bind parameters for the statement.
 * @returns {Promise<unknown[]>} Result rows for `SELECT`/`PRAGMA`/`RETURNING`, otherwise an empty array.
 */
export type DbQuery = (sqlString: string, ...parameter: unknown[]) => Promise<unknown[]>;

/**
 * Closes an open SQLite connection.
 * @returns {Promise<void>} Resolves once the connection has been closed.
 */
export type DbClose = () => Promise<void>;

/**
 * Constructor options for `KeyvSqlite`.
 */
export type KeyvSqliteOptions = {
	/**
	 * SQLite connection URI.
	 * @default 'sqlite://:memory:'
	 */
	uri?: string;
	/**
	 * SQLite busy timeout in milliseconds. Controls how long SQLite waits
	 * when the database is locked by another connection.
	 */
	busyTimeout?: number;
	/**
	 * Table name for key-value storage. Sanitized to alphanumeric and underscore characters.
	 * @default 'keyv'
	 */
	table?: string;
	/**
	 * Maximum key length (VARCHAR size). Alias: `keyLength`.
	 * @default 255
	 */
	keySize?: number;
	/**
	 * Deprecated alias for `keySize`.
	 * @deprecated Use `keySize` instead.
	 */
	keyLength?: number;
	/**
	 * Maximum namespace length (VARCHAR size).
	 * @default 255
	 */
	namespaceLength?: number;
	/**
	 * Number of rows fetched per iterator batch.
	 * @default 10
	 */
	iterationLimit?: number;
	/**
	 * Enable WAL (Write-Ahead Logging) mode. Ignored for in-memory databases.
	 * @default false
	 */
	wal?: boolean;
	/**
	 * Interval in milliseconds between automatic expired-entry cleanup runs. `0` disables.
	 * @default 0
	 */
	clearExpiredInterval?: number;
	/**
	 * Explicit driver selection or custom driver object. Auto-detected if omitted.
	 */
	driver?: SqliteDriverName | SqliteDriver;
};

/**
 * Minimal database handle returned by a {@link SqliteDriver}.
 */
export type Db = {
	/** Execute a SQL statement. @see {@link DbQuery} */
	query: DbQuery;
	/** Close the connection. @see {@link DbClose} */
	close: DbClose;
};
