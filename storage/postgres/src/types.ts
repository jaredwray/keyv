import type { PoolConfig } from "pg";
import type { ConnectionOptions } from "tls";

export type KeyvPostgresOptions = {
	uri?: string;
	table?: string;
	keySize?: number;
	schema?: string;
	ssl?: boolean | ConnectionOptions;
	iterationLimit?: number;
	useUnloggedTable?: boolean;
	namespacePrefix?: string;
} & PoolConfig;

// biome-ignore lint/suspicious/noExplicitAny: values can be any type for parameterized queries
export type Query = (sqlString: string, values?: any) => Promise<any[]>;
