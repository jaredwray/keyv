import EventEmitter from 'node:events';
import Database from 'better-sqlite3';

export = KeyvSqlite;
declare class KeyvSqlite extends EventEmitter {
	readonly ttlSupport: false;
	namespace?: string | undefined;
	opts: any;
	db: Database;
	constructor(options?: string | KeyvSqlite.Options);
	get(key: any): any;
	getMany(keys: any): any[];
	set(key: string, value: any): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: any): AsyncGenerator<any, void, any>;
	has(key: any): boolean;
}

declare namespace KeyvSqlite {
	interface Options {
		uri?: string | undefined;
		busyTimeout?: number | undefined;
		table?: string | undefined;
		keySize?: number | undefined;
	}
}
