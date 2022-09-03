import EventEmitter from 'node:events';
import type {Store, StoredData} from 'keyv';

declare class KeyvOffline extends EventEmitter implements Store<Value> {
	proxy: any;
	constructor(keyv: any);
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

export = KeyvOffline;
