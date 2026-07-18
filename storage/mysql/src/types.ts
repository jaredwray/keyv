import type { PoolOptions } from "mysql2";

/** Character limits accepted by {@link KeyvMysql.resizeKeyColumns}. */
export type KeyvMysqlKeyColumnOptions = {
	keyLength?: number;
	namespaceLength?: number;
};

/** Options accepted when constructing a MySQL storage adapter. */
export type KeyvMysqlOptions = {
	uri?: string;
	table?: string;
	keyLength?: number;
	namespaceLength?: number;
	intervalExpiration?: number;
	iterationLimit?: number;
} & PoolOptions;
