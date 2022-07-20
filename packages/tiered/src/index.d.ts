import {EventEmitter} from 'events';
import {Store, StoredData} from 'keyv';

export = KeyvTiered;
declare class KeyvTiered extends EventEmitter implements Store<Value> {
	constructor(options: KeyvTiered.Options);
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

declare namespace KeyvTiered {
	interface Options {
		local: Store<Value>;
		remote: Store<Value>;
		localOnly?: boolean;
		iterationLimit?: number | undefined;
	}
}
