import type { Db } from "../types.js";

/**
 * Built-in and custom SQLite driver names accepted by the `driver` option.
 */
export type SqliteDriverName = "better-sqlite3" | "node:sqlite" | "bun:sqlite" | "custom";

/**
 * Connection options passed to {@link SqliteDriver.connect}.
 */
export type SqliteDriverConnectOptions = {
	/** Database file path, or `':memory:'` for an in-memory database. */
	filename: string;
	/** SQLite busy timeout in milliseconds. */
	busyTimeout?: number;
	/** Whether WAL mode should be enabled (ignored for in-memory databases). */
	wal?: boolean;
};

/**
 * Pluggable SQLite driver used by {@link KeyvSqlite}.
 */
export type SqliteDriver = {
	/** Driver identifier reported as `driverName` on `KeyvSqlite`. */
	name: SqliteDriverName;
	/**
	 * Opens a database connection.
	 * @param {SqliteDriverConnectOptions} options - File path, busy timeout, and WAL flag.
	 * @returns {Promise<Db>} A handle with `query` and `close`.
	 */
	connect(options: SqliteDriverConnectOptions): Promise<Db>;
};
