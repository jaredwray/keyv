// biome-ignore-all lint/suspicious/noExplicitAny: type format
import type { StoredData } from "keyv";
import type { PoolConfig } from "pg";

export type IteratorOutput = AsyncGenerator<any, void, any>;

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<
	Array<StoredData<Value | undefined>>
>;

export type SetOutput = Promise<any>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type HasOutput = Promise<boolean>;

export type DisconnectOutput = Promise<void>;

export type KeyvPostgresOptions = {
	uri?: string;
	table?: string;
	keySize?: number;
	schema?: string;
	ssl?: any;
	dialect?: string;
	iterationLimit?: number;
	useUnloggedTable?: boolean;
} & PoolConfig;

export type Query = (sqlString: string, values?: any) => Promise<any[]>;
