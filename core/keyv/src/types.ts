import type { IEventEmitter } from "hookified";
import type { KeyvStorageCapability } from "./capabilities.js";

/**
 * A Map or any Map-like object. Used as a flexible input type for stores.
 */
// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvMapAny = Map<any, any> | any;

/**
 * Adapter interface for custom serialization.
 * Implement `stringify` and `parse` to control how values are serialized to/from strings.
 */
export type KeyvSerializationAdapter = {
	/** Converts a value to a string representation. */
	stringify: (object: unknown) => string | Promise<string>;
	/** Parses a string back into its original value. */
	parse: <T>(data: string) => T | Promise<T>;
};

/**
 * Adapter interface for compression.
 * Implement `compress` and `decompress` to add compression to stored values.
 */
export type KeyvCompressionAdapter = {
	/** Compresses a string value. */
	compress(value: string): Promise<string>;
	/** Decompresses a string value back to its original form. */
	decompress(value: string): Promise<string>;
};

/**
 * Adapter interface for encryption.
 * Implement `encrypt` and `decrypt` to add encryption to stored values.
 */
export type KeyvEncryptionAdapter = {
	/** Encrypts a string value. */
	encrypt: (data: string) => string | Promise<string>;
	/** Decrypts a string value back to its original form. */
	decrypt: (data: string) => string | Promise<string>;
};

/**
 * The envelope structure used to store values in Keyv.
 * Wraps the actual value with an optional expiration timestamp.
 */
export type KeyvValue<Value> = {
	/** The stored value. */
	value?: Value;
	/** Absolute expiration timestamp in milliseconds since epoch, or `undefined` for no expiry. */
	expires?: number | undefined;
};

/** @deprecated Use `KeyvValue` instead. */
export type DeserializedData<Value> = KeyvValue<Value>;

/**
 * Events emitted by Keyv for error handling and telemetry.
 */
export enum KeyvEvents {
	/** Emitted when an error occurs in a store operation. */
	ERROR = "error",
	/** Emitted for informational messages. */
	INFO = "info",
	/** Emitted for warning messages. */
	WARN = "warn",
	/** Telemetry: cache hit. */
	STAT_HIT = "stat:hit",
	/** Telemetry: cache miss. */
	STAT_MISS = "stat:miss",
	/** Telemetry: value set. */
	STAT_SET = "stat:set",
	/** Telemetry: value deleted. */
	STAT_DELETE = "stat:delete",
	/** Telemetry: operation error. */
	STAT_ERROR = "stat:error",
}

/**
 * Structure of a telemetry event emitted by Keyv.
 */
export type KeyvTelemetryEvent = {
	/** The event type (e.g. "hit", "miss", "set", "delete", "error"). */
	event: string;
	/** The cache key involved, if applicable. */
	key?: string;
	/** The namespace of the Keyv instance. */
	namespace?: string;
	/** Unix timestamp in milliseconds when the event occurred. */
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

/**
 * Hook names for intercepting Keyv operations.
 * Register hooks via `keyv.on(KeyvHooks.BEFORE_SET, callback)` to run logic before/after operations.
 */
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
	/** @deprecated Use BEFORE_SET_MANY instead */
	PRE_SET_MANY = "preSetMany",
	/** @deprecated Use AFTER_SET_MANY instead */
	POST_SET_MANY = "postSetMany",
	/** @deprecated Use BEFORE_DELETE instead */
	PRE_DELETE = "preDelete",
	/** @deprecated Use AFTER_DELETE instead */
	POST_DELETE = "postDelete",
	/** @deprecated Use BEFORE_DELETE_MANY instead */
	PRE_DELETE_MANY = "preDeleteMany",
	/** @deprecated Use AFTER_DELETE_MANY instead */
	POST_DELETE_MANY = "postDeleteMany",

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
	BEFORE_SET_MANY = "before:setMany",
	AFTER_SET_MANY = "after:setMany",
	BEFORE_SET_MANY_RAW = "before:setManyRaw",
	AFTER_SET_MANY_RAW = "after:setManyRaw",
	BEFORE_DELETE = "before:delete",
	AFTER_DELETE = "after:delete",
	BEFORE_DELETE_MANY = "before:deleteMany",
	AFTER_DELETE_MANY = "after:deleteMany",
	BEFORE_HAS = "before:has",
	AFTER_HAS = "after:has",
	BEFORE_HAS_MANY = "before:hasMany",
	AFTER_HAS_MANY = "after:hasMany",
	BEFORE_CLEAR = "before:clear",
	AFTER_CLEAR = "after:clear",
	BEFORE_DISCONNECT = "before:disconnect",
	AFTER_DISCONNECT = "after:disconnect",
}

/**
 * Represents a key-value entry with an optional TTL, used for batch operations like `setMany`.
 */
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

/** The unwrapped value returned by `get()`, or `undefined` if not found. */
export type StoredDataNoRaw<Value> = Value | undefined;

/** The raw `KeyvValue` envelope returned by `getRaw()`, or `undefined` if not found. */
export type StoredDataRaw<Value> = KeyvValue<Value> | undefined;

/** Union of raw and unwrapped stored data types. */
export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

/**
 * Interface that all Keyv storage adapters must implement.
 * Adapters handle the actual persistence of key-value pairs.
 */
export type KeyvStorageAdapter = {
	/** Optional namespace for key isolation. */
	namespace?: string | undefined;
	/** Detected capabilities of the underlying store. */
	capabilities?: KeyvStorageCapability;
	/** Retrieves a value by key. */
	get<Value>(key: string): Promise<StoredData<Value> | undefined>;
	/** Stores a value with a key and optional TTL in milliseconds. */
	set(key: string, value: unknown, ttl?: number): Promise<boolean>;
	/** Stores multiple entries at once. */
	setMany<Value>(values: KeyvEntry<Value>[]): Promise<boolean[] | undefined>;
	/** Deletes a key from the store. */
	delete(key: string): Promise<boolean>;
	/** Clears all entries from the store (respects namespace if set). */
	clear(): Promise<void>;
	/** Checks if a key exists in the store. */
	has(key: string): Promise<boolean>;
	/** Checks if multiple keys exist in the store. */
	hasMany(keys: string[]): Promise<boolean[]>;
	/** Retrieves multiple values by keys. */
	getMany<Value>(keys: string[]): Promise<Array<StoredData<Value | undefined>>>;
	/** Disconnects from the store and releases resources. */
	disconnect?(): Promise<void>;
	/** Deletes multiple keys from the store. */
	deleteMany(key: string[]): Promise<boolean[]>;
	/** Returns an async iterator over all key-value pairs. */
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

/**
 * Options for configuring sanitization pattern categories.
 * All categories default to `true` when the parent scope is enabled.
 */
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
	 * @default false
	 */
	keys?: boolean | KeyvSanitizePatternsOptions;
	/**
	 * Sanitize namespace strings. Pass `true` for all pattern categories, `false` to skip,
	 * or a `KeyvSanitizePatternOptions` object for granular control.
	 * @default false
	 */
	namespace?: boolean | KeyvSanitizePatternsOptions;
};

/**
 * Adapter interface for key and namespace sanitization.
 * Implement this to provide custom sanitization logic to Keyv.
 */
export type KeyvSanitizeAdapter = {
	/** Whether any sanitization is currently enabled. */
	readonly enabled: boolean;
	/** The key sanitization pattern configuration. */
	readonly keys: KeyvSanitizePatterns;
	/** The namespace sanitization pattern configuration. */
	readonly namespace: KeyvSanitizePatterns;
	/** Sanitize a single key. */
	cleanKey(key: string): string;
	/** Sanitize an array of keys. */
	cleanKeys(keys: string[]): string[];
	/** Sanitize a namespace string. */
	cleanNamespace(ns: string): string;
};

/**
 * Configuration options for the Keyv constructor.
 */
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
	 * @default undefined
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	compression?: KeyvCompressionAdapter | any;
	/**
	 * Enable or disable statistics (default is false)
	 * @default false
	 */
	stats?: boolean;
	/**
	 * Will throw on all errors if this is enabled to true. By default, errors
	 * will only throw if there are no listeners to the error event.
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
	/**
	 * Enable encryption of stored values. Pass a `KeyvEncryptionAdapter` with
	 * `encrypt` and `decrypt` methods.
	 * @default undefined
	 */
	encryption?: KeyvEncryptionAdapter;
	/**
	 * When true, Keyv checks expiry on get/getMany/has/hasMany at its layer.
	 * When false (default), trusts the storage adapter to handle expiry.
	 * @default false
	 */
	checkExpired?: boolean;
};

/**
 * @deprecated Use `KeyvStorageAdapter` instead.
 */
export type KeyvStoreAdapter = KeyvStorageAdapter;

/**
 * @deprecated Use `KeyvCompressionAdapter` instead.
 */
export type KeyvCompression = KeyvCompressionAdapter;
