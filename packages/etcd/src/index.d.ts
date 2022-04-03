import {EventEmitter} from 'events';
import Etcd3 from 'etcd3';

declare class KeyvEtcd extends EventEmitter {
	ttlSupport: any;
	opts: any;
	client: Etcd3;
	lease: import('etcd3').Lease;
	constructor(url: any, options: any);
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: string | undefined): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}

export = KeyvEtcd;
