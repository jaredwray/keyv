import type { IEventEmitter } from "hookified";

export type KeyvSerializationAdapter = {
	stringify: (object: unknown) => string | Promise<string>;
	parse: <T>(data: string) => T | Promise<T>;
};

export type KeyvCompressionAdapter = {
	compress(value: string): Promise<string>;
	decompress(value: string): Promise<string>;
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
	/** @deprecated Use BEFORE_SET instead */
	PRE_SET = "preSet",
	/** @deprecated Use AFTER_SET instead */
	POST_SET = "postSet",
	/** @deprecated Use BEFORE_GET instead */
	PRE_GET = "preGet",
	/** @deprecated Use AFTER_GET instead */
	POST_GET = "postGet",
	/** @deprecated Use BEFORE_GET_MANY instead */
	PRE_GET_MANY = "preGetMany",
	/** @deprecated Use AFTER_GET_MANY instead */
	POST_GET_MANY = "postGetMany",
	/** @deprecated Use BEFORE_GET_RAW instead */
	PRE_GET_RAW = "preGetRaw",
	/** @deprecated Use AFTER_GET_RAW instead */
	POST_GET_RAW = "postGetRaw",
	/** @deprecated Use BEFORE_GET_MANY_RAW instead */
	PRE_GET_MANY_RAW = "preGetManyRaw",
	/** @deprecated Use AFTER_GET_MANY_RAW instead */
	POST_GET_MANY_RAW = "postGetManyRaw",
	/** @deprecated Use BEFORE_SET_RAW instead */
	PRE_SET_RAW = "preSetRaw",
	/** @deprecated Use AFTER_SET_RAW instead */
	POST_SET_RAW = "postSetRaw",
	/** @deprecated Use BEFORE_SET_MANY_RAW instead */
	PRE_SET_MANY_RAW = "preSetManyRaw",
	/** @deprecated Use AFTER_SET_MANY_RAW instead */
	POST_SET_MANY_RAW = "postSetManyRaw",
	/** @deprecated Use BEFORE_DELETE instead */
	PRE_DELETE = "preDelete",
	/** @deprecated Use AFTER_DELETE instead */
	POST_DELETE = "postDelete",

	BEFORE_SET = "before:set",
	AFTER_SET = "after:set",
	BEFORE_GET = "before:get",
	AFTER_GET = "after:get",
	BEFORE_GET_MANY = "before:getMany",
	AFTER_GET_MANY = "after:getMany",
	BEFORE_GET_RAW = "before:getRaw",
	AFTER_GET_RAW = "after:getRaw",
	BEFORE_GET_MANY_RAW = "before:getManyRaw",
	AFTER_GET_MANY_RAW = "after:getManyRaw",
	BEFORE_SET_RAW = "before:setRaw",
	AFTER_SET_RAW = "after:setRaw",
	BEFORE_SET_MANY_RAW = "before:setManyRaw",
	AFTER_SET_MANY_RAW = "after:setManyRaw",
	BEFORE_DELETE = "before:delete",
	AFTER_DELETE = "after:delete",
}

// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvEntry<Value = any> = {
	/**
	 * Key to set.
	 */
	key: string;
	/**
	 * Value to set.
	 */
	value: Value;
	/**
	 * Time to live in milliseconds.
	 */
	ttl?: number;
};

export type StoredDataNoRaw<Value> = Value | undefined;

export type StoredDataRaw<Value> = DeserializedData<Value> | undefined;

export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

export type KeyvStorageAdapter = {
	// biome-ignore lint/suspicious/noExplicitAny: type format
	opts: any;
	namespace?: string | undefined;
	get<Value>(key: string): Promise<StoredData<Value> | undefined>;
	// biome-ignore lint/suspicious/noExplicitAny: type format
	set(key: string, value: any, ttl?: number): Promise<boolean>;
	setMany?<Value>(values: KeyvEntry<Value>[]): Promise<boolean[] | undefined>;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has?(key: string): Promise<boolean>;
	hasMany?(keys: string[]): Promise<boolean[]>;
	getMany?<Value>(
		keys: string[],
	): Promise<Array<StoredData<Value | undefined>>>;
	disconnect?(): Promise<void>;
	deleteMany?(key: string[]): Promise<boolean[]>;
	iterator?<Value>(): AsyncGenerator<
		Array<string | Awaited<Value> | undefined>,
		void
	>;
} & IEventEmitter;

export type KeyvOptions = {
	/**
	 * Namespace for the current instance.
	 * @default 'keyv'
	 */
	namespace?: string;
	/**
	 * A custom serialization adapter with stringify and parse methods.
	 * @default KeyvJsonSerializer (built-in)
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
	 * Will enable throwing errors when there are no error listeners registered.
	 * This maps to hookified's `throwOnEmitError` under the hood.
	 * @default false
	 */
	throwOnErrors?: boolean;
};

/**
 * @deprecated Use `KeyvStorageAdapter` instead.
 */
export type KeyvStoreAdapter = KeyvStorageAdapter;

/**
 * @deprecated Use `KeyvCompressionAdapter` instead.
 */
export type KeyvCompression = KeyvCompressionAdapter;
