import type { ConnectionOptions } from "node:tls";
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
} & PoolConfig;

// biome-ignore lint/suspicious/noExplicitAny: values can be any type for parameterized queries
export type Query = (sqlString: string, values?: any) => Promise<any[]>;
