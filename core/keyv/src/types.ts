export type KeyvSerializationAdapter = {
	stringify: (object: unknown) => string | Promise<string>;
	parse: <T>(data: string) => T | Promise<T>;
};

export type KeyvCompressionAdapter = {
	// biome-ignore lint/suspicious/noExplicitAny: type format
	compress(value: any, options?: any): Promise<any>;
	// biome-ignore lint/suspicious/noExplicitAny: type format
	decompress(value: any, options?: any): Promise<any>;
};

export type KeyvEncryptionAdapter = {
	encrypt: (data: string) => string | Promise<string>;
	decrypt: (data: string) => string | Promise<string>;
};

export type DeserializedData<Value> = {
	value?: Value;
	expires?: number | undefined;
};

export enum KeyvHooks {
	PRE_SET = "preSet",
	POST_SET = "postSet",
	PRE_GET = "preGet",
	POST_GET = "postGet",
	PRE_GET_MANY = "preGetMany",
	POST_GET_MANY = "postGetMany",
	PRE_GET_RAW = "preGetRaw",
	POST_GET_RAW = "postGetRaw",
	PRE_GET_MANY_RAW = "preGetManyRaw",
	POST_GET_MANY_RAW = "postGetManyRaw",
	PRE_SET_RAW = "preSetRaw",
	POST_SET_RAW = "postSetRaw",
	PRE_SET_MANY_RAW = "preSetManyRaw",
	POST_SET_MANY_RAW = "postSetManyRaw",
	PRE_DELETE = "preDelete",
	POST_DELETE = "postDelete",
}

export type KeyvEntry = {
	/**
	 * Key to set.
	 */
	key: string;
	/**
	 * Value to set.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	value: any;
	/**
	 * Time to live in milliseconds.
	 */
	ttl?: number;
};

export type StoredDataNoRaw<Value> = Value | undefined;

export type StoredDataRaw<Value> = DeserializedData<Value> | undefined;

export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

export type IEventEmitter = {
	// biome-ignore lint/suspicious/noExplicitAny: type format
	on(event: string, listener: (...arguments_: any[]) => void): IEventEmitter;
};

export type KeyvStorageAdapter = {
	// biome-ignore lint/suspicious/noExplicitAny: type format
	opts: any;
	namespace?: string | undefined;
	get<Value>(key: string): Promise<StoredData<Value> | undefined>;
	// biome-ignore lint/suspicious/noExplicitAny: type format
	set(key: string, value: any, ttl?: number): any;
	setMany?(
		// biome-ignore lint/suspicious/noExplicitAny: type format
		values: Array<{ key: string; value: any; ttl?: number }>,
	): Promise<void>;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has?(key: string): Promise<boolean>;
	hasMany?(keys: string[]): Promise<boolean[]>;
	getMany?<Value>(
		keys: string[],
	): Promise<Array<StoredData<Value | undefined>>>;
	disconnect?(): Promise<void>;
	deleteMany?(key: string[]): Promise<boolean>;
	iterator?<Value>(
		namespace?: string,
	): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;

export type KeyvOptions = {
	/**
	 * Emit errors
	 * @default true
	 */
	emitErrors?: boolean;
	/**
	 * Namespace for the current instance.
	 * @default 'keyv'
	 */
	namespace?: string;
	/**
	 * A custom serialization adapter with stringify and parse methods.
	 * @default KeyvJsonSerializer from @keyv/serialize
	 */
	serialization?: KeyvSerializationAdapter | false;
	/**
	 * The storage adapter instance to be used by Keyv.
	 * @default new Map() - in-memory store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	store?: KeyvStorageAdapter | Map<any, any> | any;
	/**
	 * Default TTL in milliseconds. Can be overridden by specifying a TTL on `.set()`.
	 * @default undefined
	 */
	ttl?: number;
	/**
	 * Enable compression option
	 * @default false
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	compression?: KeyvCompressionAdapter | any;
	/**
	 * Enable or disable statistics (default is false)
	 * @default false
	 */
	stats?: boolean;
	/**
	 * Enable or disable key prefixing (default is true)
	 * @default true
	 */
	useKeyPrefix?: boolean;
	/**
	 * Will enable throwing errors on methods in addition to emitting them.
	 * @default false
	 */
	throwOnErrors?: boolean;
};
