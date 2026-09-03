import type { ConnectionOptions } from "node:tls";
import type { KeyvAny, KeyvAnyArray } from "keyv";
import type { PoolConfig } from "pg";

/**
 * Configuration options for {@link KeyvPostgres}.
 * Unknown keys are forwarded to the `pg` {@link PoolConfig}.
 */
export type KeyvPostgresOptions = {
	/** PostgreSQL connection URI. @default 'postgresql://localhost:5432' */
	uri?: string;
	/** Table name for key-value storage. @default 'keyv' */
	table?: string;
	/** Maximum key column length (VARCHAR size). @default 255 */
	keyLength?: number;
	/** Maximum namespace column length (VARCHAR size). @default 255 */
	namespaceLength?: number;
	/** PostgreSQL schema name. Created automatically if it does not exist. @default 'public' */
	schema?: string;
	/** SSL/TLS configuration passed to the `pg` driver. @default undefined */
	ssl?: boolean | ConnectionOptions;
	/** Number of rows fetched per batch during iteration. @default 10 */
	iterationLimit?: number;
	/** Use a PostgreSQL UNLOGGED table for better write performance. @default false */
	useUnloggedTable?: boolean;
	/** Interval in milliseconds between automatic expired-entry cleanup runs. `0` disables. @default 0 */
	clearExpiredInterval?: number;
} & PoolConfig;

/**
 * Executes a parameterized SQL statement and returns the result rows.
 *
 * @param {string} sqlString - The SQL statement to execute.
 * @param {KeyvAny} [values] - Bind parameters for the statement.
 * @returns {Promise<KeyvAnyArray>} The result rows.
 */
export type Query = (sqlString: string, values?: KeyvAny) => Promise<KeyvAnyArray>;
