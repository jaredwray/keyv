export type DbQuery = (
	sqlString: string,
	...parameter: unknown[]
	// biome-ignore lint/suspicious/noExplicitAny: type format
) => Promise<any>;
export type DbClose = () => Promise<void>;

import type { SqliteDriver, SqliteDriverName } from "./drivers/types.js";

export type KeyvSqliteOptions = {
	dialect?: string;
	uri?: string;
	busyTimeout?: number;
	table?: string;
	/** Maximum key length (VARCHAR size). Alias: keyLength. @default 255 */
	keySize?: number;
	/** Maximum key length (VARCHAR size). Alias for keySize. @default 255 */
	keyLength?: number;
	/** Maximum namespace length (VARCHAR size). @default 255 */
	namespaceLength?: number;
	db?: string;
	iterationLimit?: number | string;
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
