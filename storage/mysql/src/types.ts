import type { ConnectionOptions } from "mysql2";

export type KeyvMysqlOptions = {
	uri?: string;
	table?: string;
	keySize?: number;
	namespaceLength?: number;
	intervalExpiration?: number;
	iterationLimit?: number;
} & ConnectionOptions;
