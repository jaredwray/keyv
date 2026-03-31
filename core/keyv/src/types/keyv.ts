import type { KeyvSanitizeOptions } from "../sanitize.js";
import type {
	KeyvCompressionAdapter,
	KeyvEncryptionAdapter,
	KeyvSerializationAdapter,
	KeyvStorageAdapter,
} from "./adapters.js";

export type {
	KeyvCompression,
	KeyvCompressionAdapter,
	KeyvEncryptionAdapter,
	KeyvSerializationAdapter,
	KeyvStorageAdapter,
	KeyvStoreAdapter,
} from "./adapters.js";

/**
 * A Map or any Map-like object. Used as a flexible input type for stores.
 */
// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvMapAny = Map<any, any> | any;

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

export type { KeyvStatsOptions, KeyvTelemetryEvent } from "../stats.js";

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

export type {
	KeyvSanitizeAdapter,
	KeyvSanitizeOptions,
	KeyvSanitizePatterns,
} from "../sanitize.js";

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
