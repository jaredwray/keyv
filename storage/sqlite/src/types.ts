import type { SqliteDriver, SqliteDriverName } from "./drivers/types.js";

export type DbQuery = (
	sqlString: string,
	...parameter: unknown[]
) => Promise<unknown[]>;
export type DbClose = () => Promise<void>;

export type KeyvSqliteOptions = {
	uri?: string;
	busyTimeout?: number;
	table?: string;
	/** Maximum key length (VARCHAR size). Alias: keyLength. @default 255 */
	keySize?: number;
	/** @deprecated Use `keySize` instead. */
	keyLength?: number;
	/** Maximum namespace length (VARCHAR size). @default 255 */
	namespaceLength?: number;
	iterationLimit?: number;
	/** Enable WAL (Write-Ahead Logging) mode. */
	wal?: boolean;
	/** Interval in milliseconds between automatic expired-entry cleanup runs. 0 disables. @default 0 */
	clearExpiredInterval?: number;
	/** Explicit driver selection or custom driver object. Auto-detected if omitted. */
	driver?: SqliteDriverName | SqliteDriver;
};

export type Db = {
	query: DbQuery;
	close: DbClose;
};
