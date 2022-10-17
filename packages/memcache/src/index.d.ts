
import {EventEmitter} from 'node:events';
import {Store, StoredData} from 'keyv';

declare class KeyvMemcache<Value=any> extends EventEmitter implements Store<Value> {
	ttlSupport: boolean;
	namespace?: string | undefined;

	constructor(uri?: string | KeyvMemcache.Options);
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

declare namespace KeyvMemcache {
	interface Options {
		url?: string | undefined;
		uri?: string | undefined;
	}
}

export = KeyvMemcache;
