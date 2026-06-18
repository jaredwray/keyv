import type { IEventEmitter } from "hookified";
import type { KeyvStorageCapability } from "../capabilities.js";
import type { KeyvStorageEntry, KeyvValue } from "./keyv.js";

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

export type KeyvStorageGetResult<Value> = KeyvValue<Value> | string | undefined;

/**
 * Interface that all Keyv storage adapters must implement.
 * Adapters handle the actual persistence of key-value pairs.
 */
export type KeyvStorageAdapter = {
	/** Optional namespace for key isolation. */
	namespace?: string | undefined;
	/**
	 * The adapter's capabilities. v6 adapters set `capabilities.expires = true` (e.g. via
	 * `keyvStorageCapability(this)`) to declare they accept an absolute `expires` timestamp
	 * on `set`/`setMany`. Full storage adapters that omit it are treated as legacy relative-`ttl`
	 * adapters and wrapped by `KeyvBridgeAdapter`, which converts `expires` back to a ttl.
	 *
	 * Declaring `expires: true` also obliges the adapter to enforce expiry on read: Keyv core
	 * does not filter expired entries by default, so `get`/`getMany`/`has` must not return a key
	 * past its deadline. See {@link KeyvStorageCapability.expires}.
	 */
	capabilities?: KeyvStorageCapability;
	/** Retrieves a value by key. */
	get<Value>(key: string): Promise<KeyvStorageGetResult<Value>>;
	/**
	 * Stores a value with a key and optional absolute expiry.
	 * @param expires Absolute expiry as Unix ms since epoch; `undefined` means no expiry.
	 * A value `<= Date.now()` is already expired and the adapter may delete/skip it.
	 */
	set(key: string, value: unknown, expires?: number): Promise<boolean>;
	/** Stores multiple entries at once, each with an absolute `expires` timestamp. */
	setMany<Value>(values: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined>;
	/** Deletes a key from the store. */
	delete(key: string): Promise<boolean>;
	/** Clears all entries from the store (respects namespace if set). */
	clear(): Promise<void>;
	/** Checks if a key exists in the store. */
	has(key: string): Promise<boolean>;
	/** Checks if multiple keys exist in the store. */
	hasMany(keys: string[]): Promise<boolean[]>;
	/** Retrieves multiple values by keys. */
	getMany<Value>(keys: string[]): Promise<Array<KeyvStorageGetResult<Value | undefined>>>;
	/** Disconnects from the store and releases resources. */
	disconnect?(): Promise<void>;
	/** Deletes multiple keys from the store. */
	deleteMany(key: string[]): Promise<boolean[]>;
	/** Returns an async iterator over all key-value pairs. */
	iterator?<Value>(): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;

/**
 * @deprecated Use `KeyvStorageAdapter` instead.
 */
export type KeyvStoreAdapter = KeyvStorageAdapter;

/**
 * @deprecated Use `KeyvCompressionAdapter` instead.
 */
export type KeyvCompression = KeyvCompressionAdapter;
