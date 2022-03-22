import EventEmitter from 'node:events';

export = KeyvPostgres;
declare class KeyvPostgres extends EventEmitter {
	readonly ttlSupport: false;
	opts: any;
	query: (sqlString: any) => any;
	constructor(options?: string | KeyvPostgres.Options);
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: string | undefined): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}
declare namespace KeyvPostgres {
	interface Options {
		uri?: string | undefined;
		table?: string | undefined;
		keySize?: number | undefined;
	}
}
