import EventEmitter from 'node:events';
import Database from 'better-sqlite3';

export = KeyvSqlite;
declare class KeyvSqlite extends EventEmitter {
	readonly ttlSupport: false;
	namespace?: string | undefined;
	opts: any;
	db: Database;
	constructor(options?: string | KeyvSqlite.Options);
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: string | undefined): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}

declare namespace KeyvSqlite {
	interface Options {
		uri?: string | undefined;
		busyTimeout?: number | undefined;
		table?: string | undefined;
		keySize?: number | undefined;
	}
}
