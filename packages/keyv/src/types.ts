import EventEmitter from "events";

export type DeserializedData<Value> = {
	value: Value;
	expires?: number;
};

export interface CompressionAdapter {
	compress(value: any, options?: any): Promise<any>;
	decompress(value: any, options?: any): Promise<any>;
	serialize: (<Value>(data: DeserializedData<Value>) => string) | undefined;
	deserialize: (<Value>(data: string) => DeserializedData<Value> | undefined) | undefined;
}

export type StoredDataNoRaw<Value> = Value  | undefined;

export type StoredDataRaw<Value> = DeserializedData<Value> | undefined

export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

export interface KeyvStoreAdapter extends EventEmitter{
	namespace?: string;
	get<Value>(key: string): Promise<StoredData<Value> | undefined>;
	set(key: string, value: any, ttl?: number): any;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has?(key: string): Promise<boolean>;
	getMany?<Value>(
		keys: string[]
	): Promise<StoredData<Value | undefined>[]>
	disconnect?(): Promise<void>
	deleteMany?(key: string[]): Promise<boolean>;
	iterator?<Value>(namespace?: string): AsyncGenerator<(string | Awaited<Value> | undefined)[], void, unknown>;
	opts: any
}

export interface Options {
	[key: string]: any;
	/** Namespace for the current instance. */
	namespace?: string;
	/** A custom serialization function. */
	serialize?: (<Value>(data: DeserializedData<Value>) => string);
	/** A custom deserialization function. */
	deserialize?: (<Value>(data: string) => DeserializedData<Value> | undefined);
	/** The connection string URI. */
	uri?: string;
	/** The storage adapter instance to be used by Keyv. */
	store?: KeyvStoreAdapter;
	/** Default TTL. Can be overridden by specififying a TTL on `.set()`. */
	ttl?: number;
	/** Enable compression option **/
	compression?: CompressionAdapter;
	/** Specify an adapter to use. e.g `'redis'` or `'mongodb'`. */
	adapter?: 'redis' | 'mongodb' | 'mongo' | 'sqlite' | 'postgresql' | 'postgres' | 'mysql' | undefined;
}

interface IteratorFunction {
	(arg: any): AsyncGenerator<any, void, unknown>;
}
declare class Keyv extends EventEmitter {
	opts: Options;
	iterator?: IteratorFunction;
	constructor(uri?: string | Options, opts?: Options);
	generateIterator(iterator: IteratorFunction): IteratorFunction;
	_checkIterableAdapter(): boolean;
	_getKeyPrefix(key: string): string;
	_getKeyPrefixArray(keys: string[]): string[];
	_getKeyUnprefix(key: string): string;
	get<Value>(key: string, options?: {
		raw: false;
	}): Promise<StoredDataNoRaw<Value>>;
	get<Value>(key: string, options?: {
		raw: true;
	}): Promise<StoredDataRaw<Value>>;
	get<Value>(key: string[], options?: {
		raw: false;
	}): Promise<StoredDataNoRaw<Value>[]>;
	get<Value>(key: string[], options?: {
		raw: true;
	}): Promise<StoredDataRaw<Value>[]>;
	set(key: string, value: any, ttl?: number): Promise<boolean>;
	delete(key: string | string[]): Promise<boolean | undefined | boolean[]>;
	clear(): Promise<void>;
	has(key: string): Promise<boolean>;
	disconnect(): Promise<void>;
}
export default Keyv;
