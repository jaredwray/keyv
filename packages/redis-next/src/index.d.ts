/* eslint-disable @typescript-eslint/consistent-type-definitions */
import {EventEmitter} from 'events';
import type{Store, StoredData} from 'keyv';
import type{Redis, Cluster} from 'ioredis';

declare class KeyvRedis<Value=any> extends EventEmitter implements Store<Value> {
	readonly ttlSupport: false;
	namespace?: string | undefined;
	opts: Record<string, unknown>;
	redis: any;
	constructor(options?: KeyvRedis.Options | Redis | Cluster);
	constructor(uri: string | Redis | Cluster, options?: KeyvRedis.Options);
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
	disconnect(): void;
}
declare namespace KeyvRedis {
	interface Options {
		uri?: string | undefined;
		dialect?: string | undefined;
	}
}
export = KeyvRedis;
