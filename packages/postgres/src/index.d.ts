/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {EventEmitter} from 'events';
import type {Store, StoredData} from 'keyv';

export = KeyvPostgres;
declare class KeyvPostgres<Value = any> extends EventEmitter implements Store<Value> {
	readonly ttlSupport: false;
	opts: any;
	query: (sqlString: any, values?: any[]) => Promise<any>;
	constructor(options?: string | KeyvPostgres.Options);
	get(key: string): Promise<Value>;
	getMany(keys: string[]): Promise<Array<StoredData<Value>>>;
	set(key: string, value: Value): Promise<void>;
	delete(key: string): Promise<boolean>;
	deleteMany(keys: string[]): Promise<boolean>;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<[string, Value], void, any>;
	has(key: string): Promise<boolean>;
}

declare namespace KeyvPostgres {
	type Options = {
		uri?: string | undefined;
		table?: string | undefined;
		keySize?: number | undefined;
		schema?: string | 'public';
		ssl?: any | undefined;
	};
}
