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

export type KeyvValue<Value> = {
	value?: Value;
	expires?: number | undefined;
};

/** @deprecated Use `KeyvValue` instead. */
export type DeserializedData<Value> = KeyvValue<Value>;

export enum KeyvEvents {
	ERROR = "error",
	INFO = "info",
	WARN = "warn",
	STAT_HIT = "stat:hit",
	STAT_MISS = "stat:miss",
	STAT_SET = "stat:set",
	STAT_DELETE = "stat:delete",
	STAT_ERROR = "stat:error",
}

export type KeyvTelemetryEvent = {
	event: string;
	key?: string;
	namespace?: string;
	timestamp: number;
};

export type KeyvStatsOptions = {
	/**
	 * Enable or disable stats tracking.
	 * @default false
	 */
	enabled?: boolean;
	/**
	 * Maximum number of entries per event-type LRU map.
	 * @default 1000
	 */
	maxEntries?: number;
	/**
	 * The event emitter (e.g. a Keyv instance) to subscribe to for telemetry events.
	 * If provided, KeyvStats will automatically subscribe on construction.
	 */
	emitter?: IEventEmitter;
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

export type StoredDataRaw<Value> = KeyvValue<Value> | undefined;

export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

export type KeyvStorageAdapter = {
	namespace?: string | undefined;
	get<Value>(key: string): Promise<StoredData<Value> | undefined>;
	// biome-ignore lint/suspicious/noExplicitAny: type format
	set(key: string, value: any, ttl?: number): Promise<boolean>;
	setMany?<Value>(values: KeyvEntry<Value>[]): Promise<boolean[] | undefined>;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has?(key: string): Promise<boolean>;
	hasMany?(keys: string[]): Promise<boolean[]>;
	getMany?<Value>(keys: string[]): Promise<Array<StoredData<Value | undefined>>>;
	disconnect?(): Promise<void>;
	deleteMany?(key: string[]): Promise<boolean[]>;
	iterator?<Value>(): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;

/**
 * Which dangerous-pattern categories to detect and strip.
 * Each defaults to `true` when the parent scope is enabled.
 */
export type KeyvSanitizePatterns = {
	/**
	 * Detect and strip SQL injection patterns: semicolons (`;`), SQL comments (`--` and `/*`).
	 * @default false
	 */
	sql: boolean;
	/**
	 * Detect and strip MongoDB operator patterns: leading `$`, `{$` sequences.
	 * @default false
	 */
	mongo: boolean;
	/**
	 * Detect and strip dangerous control sequences: null bytes (`\0`), carriage returns (`\r`), newlines (`\n`).
	 * @default false
	 */
	escape: boolean;
	/**
	 * Detect and strip path traversal patterns: `../` and `..\\` sequences.
	 * @default false
	 */
	path: boolean;
};

export type KeyvSanitizePatternsOptions = {
	/**
	 * Detect and strip SQL injection patterns: semicolons (`;`), SQL comments (`--` and `/*`).
	 * @default true
	 */
	sql?: boolean;
	/**
	 * Detect and strip MongoDB operator patterns: leading `$`, `{$` sequences.
	 * @default true
	 */
	mongo?: boolean;
	/**
	 * Detect and strip dangerous control sequences: null bytes (`\0`), carriage returns (`\r`), newlines (`\n`).
	 * @default true
	 */
	escape?: boolean;
	/**
	 * Detect and strip path traversal patterns: `../` and `..\\` sequences.
	 * @default true
	 */
	path?: boolean;
};

/**
 * Controls what gets sanitized and with which patterns.
 */
export type KeyvSanitizeOptions = {
	/**
	 * Sanitize keys. Pass `true` for all pattern categories, `false` to skip,
	 * or a `KeyvSanitizePatternOptions` object for granular control.
	 * @default true (when sanitize is enabled)
	 */
	keys?: boolean | KeyvSanitizePatternsOptions;
	/**
	 * Sanitize namespace strings. Pass `true` for all pattern categories, `false` to skip,
	 * or a `KeyvSanitizePatternOptions` object for granular control.
	 * @default true (when sanitize is enabled)
	 */
	namespace?: boolean | KeyvSanitizePatternsOptions;
};

export type KeyvOptions = {
	/**
	 * Namespace for the current instance.
	 * @default undefined
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
	/**
	 * Enable sanitization of keys and namespaces by detecting dangerous patterns
	 * for SQL, MongoDB, or filesystem-based storage backends. Pass a `KeyvSanitizeOptions`
	 * object for granular control over targets and patterns.
	 * @default undefined
	 */
	sanitize?: KeyvSanitizeOptions;
};

/**
 * @deprecated Use `KeyvStorageAdapter` instead.
 */
export type KeyvStoreAdapter = KeyvStorageAdapter;

/**
 * @deprecated Use `KeyvCompressionAdapter` instead.
 */
export type KeyvCompression = KeyvCompressionAdapter;
