import EventEmitter from "events";

export interface DeserializedData<Value> {
	value: Value; expires: number | undefined;
}

export interface CompressionAdapter<Value> {
	compress(value: any, options?: any): Promise<any>;
	decompress(value: any, options?: any): Promise<any>;
	serialize: ((data: DeserializedData<Value>) => string) | undefined;
	deserialize: ((data: string) => DeserializedData<Value> | undefined) | undefined;
}

export type StoredData<Value> = DeserializedData<Value> | string | undefined;

export interface Store<Value> extends EventEmitter{
	namespace?: string;
	get(key: string): Promise<StoredData<Value> | undefined>;
	set(key: string, value: Value, ttl?: number): any;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has?(key: string): Promise<boolean>;
	getMany?(
		keys: string[]
	): Promise<StoredData<Value>[] | Promise<StoredData<Value>[]> | undefined>
	disconnect?(): Promise<void>
	deleteMany?(key: string[]): Promise<boolean>;
	iterator?(namespace?: string): AsyncGenerator<(string | Awaited<Value> | undefined)[], void, unknown>;
	opts: Record<string, Record<string, unknown>>
}

export interface Options<Value> {
	[key: string]: any;
	/** Namespace for the current instance. */
	namespace?: string | undefined;
	/** A custom serialization function. */
	serialize?: ((data: DeserializedData<Value>) => string) | undefined;
	/** A custom deserialization function. */
	deserialize?: ((data: string) => DeserializedData<Value> | undefined) | undefined;
	/** The connection string URI. */
	uri?: string | undefined;
	/** The storage adapter instance to be used by Keyv. */
	store?: Store<Value>;
	/** Default TTL. Can be overridden by specififying a TTL on `.set()`. */
	ttl?: number | undefined;
	/** Enable compression option **/
	compression?: CompressionAdapter<Value> | undefined;
	/** Specify an adapter to use. e.g `'redis'` or `'mongodb'`. */
	adapter?: 'redis' | 'mongodb' | 'mongo' | 'sqlite' | 'postgresql' | 'postgres' | 'mysql' | undefined;
}
