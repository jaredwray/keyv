// biome-ignore-all lint/suspicious/noExplicitAny: type format
import type { PoolConfig } from "pg";

export type KeyvPostgresOptions = {
	uri?: string;
	table?: string;
	keySize?: number;
	schema?: string;
	ssl?: any;
	iterationLimit?: number;
	useUnloggedTable?: boolean;
} & PoolConfig;

export type Query = (sqlString: string, values?: any) => Promise<any[]>;
