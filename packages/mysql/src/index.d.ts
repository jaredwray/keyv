import {EventEmitter} from 'events';

export = KeyvMysql;
declare class KeyvMysql extends EventEmitter {
	readonly ttlSupport: false;
	opts: any;
	query: (sqlString: any) => any;
	constructor(options?: string | KeyvMysql.Options);
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: string | undefined): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}
declare namespace KeyvMysql {
	interface Options {
		uri?: string | undefined;
		table?: string | undefined;
		keySize?: number | undefined;
	}
}
