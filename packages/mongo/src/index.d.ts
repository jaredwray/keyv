import {EventEmitter} from 'events';
import GridFSBucket from 'mongodb';
import {Store, StoredData} from 'keyv';

declare class KeyvMongo<Value=any> extends EventEmitter implements Store<Value> {
	readonly ttlSupport: false;
	opts: Record<string, any>;
	connect: Promise<any>;
	db: import('mongodb').Db;
	bucket: GridFSBucket;
	store: import('mongodb').Collection<import('bson').Document>;
	constructor(options?: string | KeyvMongo.Options);
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
	clearExpired(): boolean | Promise<boolean>;
	clearUnusedFor(seconds: any): boolean | Promise<boolean>;
}

export = KeyvMongo;

declare namespace KeyvMongo {
	interface Options {
		url?: string | undefined;
		collection?: string | undefined;
		namespace?: string | undefined;
		serialize?: any;
		deserialize?: any;
		useGridFS?: boolean | undefined;
		uri?: string | undefined;
		dialect?: string | undefined;
	}
}
