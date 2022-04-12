import {EventEmitter} from 'events';
import {Store} from 'keyv';
import {Redis, Cluster} from 'ioredis';

declare class KeyvRedis extends EventEmitter implements Store<string | undefined> {
	readonly ttlSupport: false;
	namespace?: string | undefined;
	opts: Record<string, unknown>;
	redis: any;
	constructor(options?: KeyvRedis.Options | Redis | Cluster);
	constructor(uri: string | Redis | Cluster, options?: KeyvRedis.Options);
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: string | undefined, ttl?: number): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
}
declare namespace KeyvRedis {
	interface Options extends ClientOpts {
		uri?: string | undefined;
		dialect?: string | undefined;
	}
}
export = KeyvRedis;
