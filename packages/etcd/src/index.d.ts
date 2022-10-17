import {EventEmitter} from 'events';
import type Etcd3 from 'etcd3';
import type {Store, StoredData} from 'keyv';

declare class KeyvEtcd<Value=any> extends EventEmitter implements Store<Value> {
	ttlSupport: any;
	opts: any;
	client: Etcd3;
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	lease: import('etcd3').Lease;
	constructor(options?: string | KeyvEtcd.Options);
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

declare namespace KeyvEtcd {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	interface Options {
		url?: string | undefined;
		uri?: string | undefined;
		ttl?: number | undefined;
	}
}

export = KeyvEtcd;
