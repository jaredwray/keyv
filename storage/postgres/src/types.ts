import type { ConnectionOptions } from "node:tls";
import type { KeyvAny, KeyvAnyArray } from "keyv";
import type { PoolConfig } from "pg";

export type KeyvPostgresOptions = {
	uri?: string;
	table?: string;
	keyLength?: number;
	namespaceLength?: number;
	schema?: string;
	ssl?: boolean | ConnectionOptions;
	iterationLimit?: number;
	useUnloggedTable?: boolean;
	clearExpiredInterval?: number;
} & PoolConfig;

export type Query = (sqlString: string, values?: KeyvAny) => Promise<KeyvAnyArray>;
