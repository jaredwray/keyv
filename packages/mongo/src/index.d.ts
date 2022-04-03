import {EventEmitter} from 'events';
import GridFSBucket from 'mongodb';

declare class KeyvMongo extends EventEmitter {
	readonly ttlSupport: false;
	opts: Record<string, any>;
	connect: Promise<any>;
	db: import('mongodb').Db;
	bucket: GridFSBucket;
	store: import('mongodb').Collection<import('bson').Document>;
	constructor(options?: string | KeyvMongo.Options);
	get(key: string): Promise<string | undefined>;
	getMany(keys: string[]): Promise<string[] | undefined>;
	set(key: string, value: string | undefined): Promise<any>;
	delete(key: string): boolean;
	deleteMany(keys: string[]): boolean;
	clearExpired(): false | Promise<boolean>;
	clearUnusedFor(seconds: any): false | Promise<boolean>;
	clear(): Promise<void>;
	iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
	has(key: string): boolean;
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
