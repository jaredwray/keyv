import {EventEmitter} from 'events';
import Store from 'keyv';

export = KeyvTiered;
declare class KeyvTiered extends EventEmitter {
	constructor(options: KeyvTiered.Options);
	set(key: string, value: string | Record<string, unknown> | undefined): Promise<any>;
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}

declare namespace KeyvTiered {
	interface Options {
		local: Store<Value>;
		remote: Store<Value>;
		localOnly?: boolean;
		iterationLimit?: number | undefined;
	}
}
