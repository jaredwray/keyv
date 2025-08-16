import type { ConnectionOptions } from "mysql2";

export type KeyvMysqlOptions = {
	dialect?: "mysql";
	uri?: string;
	table?: string;
	keySize?: number;
	intervalExpiration?: number;
	iterationLimit?: string | number;
} & ConnectionOptions;
