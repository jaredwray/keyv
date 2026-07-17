import type { PoolOptions } from "mysql2";

export type KeyvMysqlOptions = {
	uri?: string;
	table?: string;
	keyLength?: number;
	namespaceLength?: number;
	intervalExpiration?: number;
	iterationLimit?: number;
} & PoolOptions;
