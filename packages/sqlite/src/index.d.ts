/* eslint-disable @typescript-eslint/consistent-type-definitions */
import {EventEmitter} from 'events';
import type {Database} from 'sqlite3';
import type {Store, StoredData} from 'keyv';

export = KeyvSqlite;
declare class KeyvSqlite<Value=any> extends EventEmitter implements Store<Value> {
	readonly ttlSupport: false;
	namespace?: string | undefined;
	opts: any;
	db: Database;
	constructor(options?: string | KeyvSqlite.Options);
	get(key: string): Promise<Value>;
	getMany?(
		keys: string[]
	): Array<StoredData<Value>> | Promise<Array<StoredData<Value>>> | undefined;
	set(key: string, value: Value, ttl?: number): any;
	delete(key: string): boolean | Promise<boolean>;
	deleteMany(keys: string[]): boolean;
	clear(): void | Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has?(key: string): boolean | Promise<boolean>;
}

declare namespace KeyvSqlite {
	interface Options {
		uri?: string | undefined;
		busyTimeout?: number | undefined;
		table?: string | undefined;
		keySize?: number | undefined;
	}
}
