/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {EventEmitter} from 'node:events';
import {Store} from 'keyv';

declare class KeyvMemcache extends EventEmitter implements Store<string | undefined> {
	ttlSupport: boolean;
	namespace?: string | undefined;

	constructor(uri?: string);
	constructor(options?: KeyvMemcache.Options);

	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: TValue | undefined): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}

declare namespace KeyvMemcache {
	interface Options {
		url?: string | undefined;
		uri?: string | undefined;
	}
}

export = KeyvMemcache;
