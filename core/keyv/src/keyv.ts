import { Hookified } from "hookified";
import { KeyvBridgeAdapter, type KeyvBridgeStore } from "./adapters/bridge.js";
import { type KeyvMapType, KeyvMemoryAdapter } from "./adapters/memory.js";
import { detectKeyvStorage } from "./capabilities.js";
import { KeyvJsonSerializer } from "./json-serializer.js";
import { KeyvSanitize } from "./sanitize.js";
import { KeyvStats } from "./stats.js";
import {
	type KeyvCompressionAdapter,
	type KeyvEncryptionAdapter,
	type KeyvEntry,
	KeyvEvents,
	KeyvHooks,
	type KeyvMapAny,
	type KeyvOptions,
	type KeyvSanitizeAdapter,
	type KeyvSerializationAdapter,
	type KeyvStorageAdapter,
	type KeyvTelemetryEvent,
	type KeyvValue,
	type StoredDataRaw,
} from "./types.js";
import {
	buildDeprecatedHooks,
	calculateExpires,
	deleteExpiredKeys,
	deprecatedHookAliases,
	isDataExpired,
	resolveTtl,
	ttlFromExpires,
} from "./utils.js";

// biome-ignore lint/suspicious/noExplicitAny: type format
export class Keyv<GenericValue = any> extends Hookified {
	/**
	 * Stats manager for tracking cache operation metrics (hits, misses, sets, deletes, errors).
	 * @default this is disabled.
	 */
	private _stats!: KeyvStats;

	/**
	 * Default time to live in milliseconds. Can be overridden per-key via {@link set}.
	 */
	private _ttl?: number;

	/**
	 * Key prefix namespace used to isolate keys across different Keyv instances sharing the same store.
	 */
	private _namespace?: string;

	/**
	 * The underlying storage adapter. Defaults to an in-memory {@link Map}.
	 */
	private _store: KeyvStorageAdapter = new KeyvMemoryAdapter(new Map());

	/**
	 * Pluggable serialization adapter with `stringify` and `parse` methods.
	 * When `undefined`, the built-in {@link KeyvJsonSerializer} is used.
	 */
	private _serialization: KeyvSerializationAdapter | undefined;

	/**
	 * Pluggable compression adapter with `compress` and `decompress` methods.
	 */
	private _compression: KeyvCompressionAdapter | undefined;

	/**
	 * Pluggable encryption adapter with `encrypt` and `decrypt` methods.
	 */
	private _encryption: KeyvEncryptionAdapter | undefined;

	/**
	 * Sanitization handler for keys and namespaces. By default it is disabled.
	 */
	private _sanitize!: KeyvSanitizeAdapter;

	/**
	 * When true, Keyv checks expiry at its layer on get/getMany/has/hasMany.
	 */
	private _checkExpired = false;

	/**
	 * Keyv Constructor
	 * @param {KeyvStorageAdapter | KeyvOptions | Map<any, any> | any} store  to be provided or just the options
	 * @param {Omit<KeyvOptions, 'store'>} [options] if you provide the store you can then provide the Keyv Options
	 */
	constructor(
		store?: KeyvStorageAdapter | KeyvOptions | KeyvMapAny,
		options?: Omit<KeyvOptions, "store">,
	);
	/**
	 * Keyv Constructor
	 * @param {KeyvOptions} options to be provided
	 */
	constructor(options?: KeyvOptions);
	/**
	 * Keyv Constructor
	 * @param {KeyvStorageAdapter | KeyvOptions} store
	 * @param {Omit<KeyvOptions, 'store'>} [options] if you provide the store you can then provide the Keyv Options
	 */
	constructor(store?: KeyvStorageAdapter | KeyvOptions, options?: Omit<KeyvOptions, "store">) {
		const mergedOptions = Keyv.resolveOptions(store, options);

		super({
			throwOnHookError: false,
			throwOnEmptyListeners: true,
			throwOnEmitError: mergedOptions.throwOnErrors ?? false,
		});

		this.deprecatedHooks = buildDeprecatedHooks();
		this._compression = mergedOptions.compression;
		this._encryption = mergedOptions.encryption;
		this.initSerialization(mergedOptions);
		this.initSanitize(mergedOptions);
		this.initNamespace(mergedOptions.namespace);
		this.initStats(mergedOptions);

		if (mergedOptions.store) {
			this.setStore(mergedOptions.store);
		}

		this.setTtl(mergedOptions.ttl);
		this._checkExpired = mergedOptions.checkExpired ?? false;
	}

	/**
	 * Get the current storage adapter.
	 * @returns {KeyvStorageAdapter} The current storage adapter.
	 */
	public get store(): KeyvStorageAdapter {
		return this._store;
	}

	/**
	 * Set the storage adapter.
	 * @param {KeyvStorageAdapter | Map<any, any> | any} store The storage adapter to set.
	 */
	public set store(store: KeyvStorageAdapter | KeyvMapAny) {
		this.setStore(store);
	}

	/**
	 * Get the current compression adapter.
	 * @returns {KeyvCompressionAdapter | undefined} The current compression adapter.
	 */
	public get compression(): KeyvCompressionAdapter | undefined {
		return this._compression;
	}

	/**
	 * Set the compression adapter.
	 * @param {KeyvCompressionAdapter | undefined} compress The compression adapter to set.
	 */
	public set compression(compress: KeyvCompressionAdapter | undefined) {
		this._compression = compress;
	}

	/**
	 * Get the current encryption adapter.
	 * @returns {KeyvEncryptionAdapter | undefined} The current encryption adapter.
	 */
	public get encryption(): KeyvEncryptionAdapter | undefined {
		return this._encryption;
	}

	/**
	 * Set the encryption adapter.
	 * @param {KeyvEncryptionAdapter | undefined} encryption The encryption adapter to set.
	 */
	public set encryption(encryption: KeyvEncryptionAdapter | undefined) {
		this._encryption = encryption;
	}

	/**
	 * Get the current namespace.
	 * @returns {string | undefined} The current namespace.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the current namespace.
	 * @param {string | undefined} namespace The namespace to set.
	 */
	public set namespace(namespace: string | undefined) {
		this._namespace =
			namespace && this._sanitize.enabled ? this._sanitize.cleanNamespace(namespace) : namespace;
		this._store.namespace = this._namespace;
	}

	/**
	 * Get the current TTL.
	 * @returns {number} The current TTL in milliseconds.
	 */
	public get ttl(): number | undefined {
		return this._ttl;
	}

	/**
	 * Set the current TTL.
	 * @param {number} ttl The TTL to set in milliseconds.
	 */
	public set ttl(ttl: number | undefined) {
		this.setTtl(ttl);
	}

	/**
	 * Get the current serialization adapter. If `undefined`, serialization is not enabled.
	 * @returns {KeyvSerializationAdapter | undefined} The current serialization adapter.
	 */
	public get serialization(): KeyvSerializationAdapter | undefined {
		return this._serialization;
	}

	/**
	 * Set the current serialization adapter. Pass a `KeyvSerializationAdapter` to enable
	 * custom serialization, or `undefined` to disable serialization entirely.
	 * @param {KeyvSerializationAdapter | undefined} serialization The serialization adapter to set.
	 */
	public set serialization(serialization: KeyvSerializationAdapter | false | undefined) {
		this._serialization = serialization === false ? undefined : serialization;
	}

	/**
	 * Get the current throwOnErrors value. When enabled, all errors with throw. By default, errors
	 * will only throw if there are no listeners to the error event.
	 * @return {boolean} The current throwOnErrors value.
	 */
	public get throwOnErrors(): boolean {
		return this.throwOnEmitError;
	}

	/**
	 * Set the current throwOnErrors value. When enabled, all errors will throw. By default, errors
	 * will only throw if there are no listeners to the error event.
	 * @param {boolean} value The throwOnErrors value to set.
	 */
	public set throwOnErrors(value: boolean) {
		this.throwOnEmitError = value;
	}

	/**
	 * Get the current sanitize adapter. Sanitization is disabled by default. To
	 * enable it `sanitize.keys` or `sanitize.namespace` to true or set KeyvSanitizePatterns
	 * to each.
	 * @returns {KeyvSanitizeAdapter} The current sanitize adapter.
	 */
	public get sanitize(): KeyvSanitizeAdapter {
		return this._sanitize;
	}

	/**
	 * Set the sanitize adapter directly and will run sanitization on namespace.
	 * @param {KeyvSanitizeAdapter} value The sanitize adapter to use.
	 */
	public set sanitize(value: KeyvSanitizeAdapter) {
		this._sanitize = value;
		/* v8 ignore next -- @preserve */
		this._namespace =
			this._namespace && this._sanitize.enabled
				? this._sanitize.cleanNamespace(this._namespace)
				: this._namespace;
	}

	/**
	 * Get the stats. This is just for this instance
	 * @returns {KeyvStats} The current stats.
	 */
	public get stats(): KeyvStats {
		return this._stats;
	}

	/**
	 * When true, Keyv checks expiry at its layer on get/getMany/has/hasMany.
	 * When false (default), trusts the storage adapter.
	 */
	public get checkExpired(): boolean {
		return this._checkExpired;
	}

	/**
	 * Set the stats. When setting a new instance it will unsubscribe the old listeners
	 * and subscribe the new instance.
	 * @param {KeyvStats} stats The stats instance to set.
	 */
	public set stats(stats: KeyvStats) {
		this._stats.unsubscribe();
		this._stats = stats;
		this._stats.subscribe(this);
	}

	/**
	 * Resolves a store to a fully-compliant KeyvStorageAdapter using a 3-tier detection chain:
	 * 1. If the store already implements the full KeyvStorageAdapter interface, use it directly.
	 * 2. If the store is map-like (synchronous get/set/delete/has), wrap it in KeyvMemoryAdapter.
	 * 3. If the store has async get/set/delete/clear, wrap it in KeyvBridgeAdapter.
	 * 4. Otherwise, emit an error and fall back to a default in-memory KeyvMemoryAdapter.
	 *
	 * NOTE: this is used for internal but provided public for custom adapter testing
	 * @param {unknown} store The store to resolve.
	 * @returns {KeyvStorageAdapter} A fully-compliant storage adapter.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: accepts any store type
	public resolveStore(store: any): KeyvStorageAdapter {
		const cap = detectKeyvStorage(store);

		if (cap.store === "keyvStorage") {
			return store as KeyvStorageAdapter;
		}

		if (cap.store === "mapLike") {
			return new KeyvMemoryAdapter(store as KeyvMapType);
		}

		if (cap.store === "asyncMap") {
			return new KeyvBridgeAdapter(store as KeyvBridgeStore);
		}

		this.emit(
			KeyvEvents.ERROR,
			new Error(
				"Could not use the provided storage adapter, falling back to KeyvMemoryAdapter with Map",
			),
		);
		return new KeyvMemoryAdapter(new Map());
	}

	/**
	 * Sets the storage adapter by resolving it via {@link resolveStore}, then wires up
	 * error forwarding and namespace propagation.
	 * @param {KeyvStorageAdapter | Map<any, any> | any} store The storage adapter to set.
	 */
	public setStore(store: KeyvStorageAdapter | KeyvMapAny): void {
		this._store = this.resolveStore(store);
		if (typeof this._store.on === "function") {
			// biome-ignore lint/suspicious/noExplicitAny: type format
			this._store.on(KeyvEvents.ERROR, (error: any) => this.emit(KeyvEvents.ERROR, error));
		}

		this._store.namespace = this._namespace;
	}

	/**
	 * Sets the TTL, treating negative values as undefined (no TTL).
	 * @param {number | undefined} ttl The TTL to set in milliseconds.
	 */
	public setTtl(ttl?: number): void {
		if (typeof ttl === "number" && ttl < 0) {
			this._ttl = undefined;
			return;
		}

		this._ttl = ttl;
	}

	/**
	 * Get the Value of a Key
	 * @param {string | string[]} key passing in a single key or multiple as an array
	 */
	public async get<Value = GenericValue>(key: string): Promise<Value | undefined>;
	public async get<Value = GenericValue>(key: string[]): Promise<Array<Value | undefined>>;
	public async get<Value = GenericValue>(
		key: string | string[],
	): Promise<Value | undefined | Array<Value | undefined>> {
		const isArray = Array.isArray(key);

		if (isArray) {
			return this.getMany<Value>(key as string[]);
		}

		key = this._sanitize.enabled ? this._sanitize.cleanKey(key as string) : (key as string);
		if (key === "") {
			return undefined;
		}

		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET, { key });
		// biome-ignore lint/suspicious/noImplicitAnyLet: need to fix
		let rawData;
		try {
			rawData = await this._store.get<Value>(key as string);
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key as string);
		}

		let data: KeyvValue<Value> | undefined;
		if (this._checkExpired) {
			[data] = await this.decodeWithExpire<Value>(key as string, rawData);
		} else {
			data =
				rawData === undefined || rawData === null
					? undefined
					: typeof rawData === "string"
						? await this.decode<Value>(rawData)
						: (rawData as KeyvValue<Value>);
		}

		if (data === undefined) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
				key,
				value: undefined,
			});
			this.emitTelemetry(KeyvEvents.STAT_MISS, key as string);
			return undefined;
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
			key,
			value: data,
		});
		this.emitTelemetry(KeyvEvents.STAT_HIT, key as string);
		return data.value;
	}

	/**
	 * Get many values of keys
	 * @param {string[]} keys passing in a single key or multiple as an array
	 */
	public async getMany<Value = GenericValue>(keys: string[]): Promise<Array<Value | undefined>> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET_MANY, { keys });

		const rawData =
			await // biome-ignore lint/style/noNonNullAssertion: guaranteed by resolveStore
			this._store.getMany!<Value>(keys);

		let deserialized: Array<KeyvValue<Value> | undefined>;
		if (this._checkExpired) {
			deserialized = await this.decodeWithExpire<Value>(keys, rawData as unknown[]);
		} else {
			deserialized = await Promise.all(
				(rawData as unknown[]).map(async (row) => {
					if (row === undefined || row === null) {
						return undefined;
					}

					return typeof row === "string" ? this.decode<Value>(row) : (row as KeyvValue<Value>);
				}),
			);
		}

		const result: Array<Value | undefined> = deserialized.map((row) =>
			row !== undefined ? row.value : undefined,
		);

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY, result);
		for (let i = 0; i < result.length; i++) {
			if (result[i] === undefined) {
				this.emitTelemetry(KeyvEvents.STAT_MISS, keys[i]);
			} else {
				this.emitTelemetry(KeyvEvents.STAT_HIT, keys[i]);
			}
		}

		return result as Array<Value | undefined>;
	}

	/**
	 * Get the raw value of a key. This is the replacement for setting raw to true in the get() method.
	 * @param {string} key the key to get
	 * @returns {Promise<StoredDataRaw<Value> | undefined>} will return a StoredDataRaw<Value> or undefined
	 * if the key does not exist or is expired.
	 */
	public async getRaw<Value = GenericValue>(
		key: string,
	): Promise<StoredDataRaw<Value> | undefined> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return undefined;
		}

		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET_RAW, { key });
		const rawData = await this._store.get(key);

		let data: KeyvValue<Value> | undefined;
		if (this._checkExpired) {
			[data] = await this.decodeWithExpire<Value>(key, rawData);
		} else {
			data =
				rawData === undefined || rawData === null
					? undefined
					: typeof rawData === "string"
						? await this.decode<Value>(rawData)
						: /* v8 ignore next -- @preserve */
							(rawData as KeyvValue<Value>);
		}

		if (data === undefined) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
				key,
				value: undefined,
			});
			this.emitTelemetry(KeyvEvents.STAT_MISS, key);
			return undefined;
		}

		this.emitTelemetry(KeyvEvents.STAT_HIT, key);

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
			key,
			value: data,
		});

		return data;
	}

	/**
	 * Get the raw values of many keys. This is the replacement for setting raw to true in the getMany() method.
	 * @param {string[]} keys the keys to get
	 * @returns {Promise<Array<StoredDataRaw<Value>>>} will return an array of StoredDataRaw<Value> or undefined if the key does not exist or is expired.
	 */
	public async getManyRaw<Value = GenericValue>(
		keys: string[],
	): Promise<Array<StoredDataRaw<Value>>> {
		/* v8 ignore next -- @preserve */
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET_MANY_RAW, { keys });

		if (keys.length === 0) {
			const result: Array<StoredDataRaw<Value>> = [];
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY_RAW, {
				keys,
				values: result,
			});
			return result;
		}

		const rawData =
			await // biome-ignore lint/style/noNonNullAssertion: guaranteed by resolveStore
			this._store.getMany!<Value>(keys);

		let result: Array<KeyvValue<Value> | undefined>;
		if (this._checkExpired) {
			result = await this.decodeWithExpire<Value>(keys, rawData as unknown[]);
		} else {
			result = await Promise.all(
				(rawData as unknown[]).map(async (row) => {
					if (row === undefined || row === null) {
						return undefined;
					}

					return typeof row === "string" ? this.decode<Value>(row) : (row as KeyvValue<Value>);
				}),
			);
		}

		// Add in hits and misses
		for (let i = 0; i < result.length; i++) {
			if (result[i] === undefined) {
				this.emitTelemetry(KeyvEvents.STAT_MISS, keys[i]);
			} else {
				this.emitTelemetry(KeyvEvents.STAT_HIT, keys[i]);
			}
		}

		// Trigger the after get many raw hook
		await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY_RAW, {
			keys,
			values: result,
		});
		return result as Array<StoredDataRaw<Value>>;
	}

	/**
	 * Set an item to the store
	 * @param {string | Array<KeyvEntry<Value>>} key the key to use. If you pass in an array of KeyvEntry it will set many items
	 * @param {Value} value the value of the key
	 * @param {number} [ttl] time to live in milliseconds
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	public async set<Value = GenericValue>(
		key: string,
		value: Value,
		ttl?: number,
	): Promise<boolean> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		const data = { key, value, ttl };
		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET, data);

		data.ttl = resolveTtl(data.ttl, this._ttl);

		const expires = calculateExpires(data.ttl);

		if (typeof data.value === "symbol") {
			this.emit(KeyvEvents.ERROR, "symbol cannot be serialized");
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key);
			return false;
		}

		const formattedValue = { value: data.value, expires };

		let result = true;
		let encodedValue: unknown = formattedValue;

		try {
			encodedValue = await this.encode(formattedValue);
			result = await this._store.set(data.key, encodedValue, data.ttl);
		} catch (error) {
			result = false;
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET, {
			key,
			value: encodedValue,
			ttl,
		});

		if (result) {
			this.emitTelemetry(KeyvEvents.STAT_SET, key);
		}

		return result;
	}

	/**
	 * Set many items to the store
	 * @param {Array<KeyvEntry<Value>>} entries the entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	public async setMany<Value = GenericValue>(entries: KeyvEntry<Value>[]): Promise<boolean[]> {
		entries = entries.map((e) => ({
			...e,
			key: this._sanitize.enabled ? this._sanitize.cleanKey(e.key) : e.key,
		}));

		const data = { entries };
		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET_MANY, data);
		entries = data.entries;

		let results: boolean[] = [];

		try {
			const serializedEntries = await Promise.all(
				entries.map(async ({ key, value, ttl }) => {
					ttl = resolveTtl(ttl, this._ttl);

					/* v8 ignore next -- @preserve */
					const expires = calculateExpires(ttl);

					/* v8 ignore next -- @preserve */
					if (typeof value === "symbol") {
						this.emit(KeyvEvents.ERROR, "symbol cannot be serialized");
						this.emitTelemetry(KeyvEvents.STAT_ERROR, key);
						throw new Error("symbol cannot be serialized");
					}

					const formattedValue = { value, expires };
					const encodedValue = await this.encode(formattedValue);
					return { key, value: encodedValue, ttl };
				}),
			);
			// biome-ignore lint/style/noNonNullAssertion: guaranteed by resolveStore
			const storeResult = await this._store.setMany!(serializedEntries);
			/* v8 ignore next -- @preserve */
			results = Array.isArray(storeResult) ? (storeResult as boolean[]) : entries.map(() => true);
			this.emitTelemetry(
				KeyvEvents.STAT_SET,
				entries.map((e) => e.key),
			);
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(
				KeyvEvents.STAT_ERROR,
				entries.map((e) => e.key),
			);

			results = entries.map(() => false);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET_MANY, { entries, values: results });

		return results;
	}

	/**
	 * Set a raw value to the store without wrapping or serialization. This is the write-side counterpart to getRaw().
	 * The value should be a KeyvValue object with { value, expires? }. If you need TTL-based expiration,
	 * set `expires` on the value directly (e.g. `{ value: 'bar', expires: Date.now() + 60000 }`).
	 * The store-level TTL is derived automatically from `value.expires`.
	 * @param {string} key the key to set
	 * @param {KeyvValue<Value>} value the raw value envelope to store
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	public async setRaw<Value = GenericValue>(
		key: string,
		value: KeyvValue<Value>,
	): Promise<boolean> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		const data = { key, value };
		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET_RAW, data);

		const ttl = ttlFromExpires(data.value.expires);

		let result = true;

		try {
			const encodedValue = await this.encode(data.value);
			const storeResult = await this._store.set(data.key, encodedValue, ttl);

			if (typeof storeResult === "boolean") {
				result = storeResult;
			}
		} catch (error) {
			result = false;
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET_RAW, {
			key,
			value: data.value,
			ttl,
		});

		if (result) {
			this.emitTelemetry(KeyvEvents.STAT_SET, key);
		}

		return result;
	}

	/**
	 * Set many raw values to the store without wrapping or serialization. This is the write-side counterpart to getManyRaw().
	 * Each entry's value should be a KeyvValue object with { value, expires? }. If you need TTL-based expiration,
	 * set `expires` on each value directly. The store-level TTL is derived automatically from `value.expires`.
	 * @param {KeyvEntry<KeyvValue<Value>>[]} entries the raw entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	public async setManyRaw<Value = GenericValue>(
		entries: KeyvEntry<KeyvValue<Value>>[],
	): Promise<boolean[]> {
		entries = entries.map((e) => ({
			...e,
			/* v8 ignore next -- @preserve */
			key: this._sanitize.enabled ? this._sanitize.cleanKey(e.key) : e.key,
		}));
		let results: boolean[] = [];

		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET_MANY_RAW, { entries });

		try {
			const rawEntries = await Promise.all(
				entries.map(async ({ key, value }) => {
					const ttl = ttlFromExpires(value.expires);
					const encodedValue = await this.encode(value);
					return { key, value: encodedValue, ttl };
				}),
			);
			const storeResult = await this._store.setMany(rawEntries);
			results = Array.isArray(storeResult) ? (storeResult as boolean[]) : entries.map(() => true);
			this.emitTelemetry(
				KeyvEvents.STAT_SET,
				entries.map((e) => e.key),
			);
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(
				KeyvEvents.STAT_ERROR,
				entries.map((e) => e.key),
			);

			results = entries.map(() => false);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET_MANY_RAW, {
			entries,
			results,
		});

		return results;
	}

	/**
	 * Delete an Entry
	 * @param {string} key the key to be deleted
	 * @returns {boolean} will return true if item is deleted. false if there is an error
	 */
	public async delete(key: string): Promise<boolean>;
	/**
	 * Delete multiple Entries
	 * @param {string[]} keys the keys to be deleted
	 * @returns {boolean[]} will return array of booleans for each key
	 */
	public async delete(keys: string[]): Promise<boolean[]>;
	public async delete(key: string | string[]): Promise<boolean | boolean[]> {
		if (Array.isArray(key)) {
			return this.deleteMany(key);
		}

		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		await this.hookWithDeprecated(KeyvHooks.BEFORE_DELETE, { key });

		let result = true;

		try {
			result = await this._store.delete(key);
		} catch (error) {
			result = false;
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key as string);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
			key,
			value: result,
		});
		this.emitTelemetry(KeyvEvents.STAT_DELETE, key as string);

		return result;
	}

	/**
	 * Delete many items from the store
	 * @param {string[]} keys the keys to be deleted
	 * @returns {boolean[]} array of booleans indicating success for each key
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		/* v8 ignore next -- @preserve */
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(KeyvHooks.BEFORE_DELETE_MANY, { keys });
		// Legacy: keep firing BEFORE_DELETE for backward compat
		await this.hookWithDeprecated(KeyvHooks.BEFORE_DELETE, { key: keys });

		let results: boolean[];

		try {
			results = await this._store.deleteMany(keys);
			this.emitTelemetry(KeyvEvents.STAT_DELETE, keys);
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, keys);
			results = keys.map(() => false);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE_MANY, { keys, values: results });
		// Legacy: keep firing AFTER_DELETE for backward compat
		await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
			key: keys,
			value: results,
		});

		return results;
	}

	/**
	 * Has a key.
	 * @param {string} key the key to check
	 * @returns {boolean} will return true if the key exists
	 */
	public async has(key: string[]): Promise<boolean[]>;
	public async has(key: string): Promise<boolean>;
	public async has(key: string | string[]): Promise<boolean | boolean[]> {
		if (Array.isArray(key)) {
			return this.hasMany(key);
		}

		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return false;
		}

		await this.hookWithDeprecated(KeyvHooks.BEFORE_HAS, { key });

		let result = false;
		try {
			if (this._checkExpired) {
				const rawData = await this._store.get(key);
				if (rawData !== undefined && rawData !== null) {
					const [data] = await this.decodeWithExpire(key, rawData);
					result = data !== undefined;
				}
			} else {
				result = await this._store.has(key);
			}
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key as string);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_HAS, { key, value: result });
		return result;
	}

	/**
	 * Check if many keys exist
	 * @param {string[]} keys the keys to check
	 * @returns {boolean[]} will return an array of booleans if the keys exist
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;

		await this.hookWithDeprecated(KeyvHooks.BEFORE_HAS_MANY, { keys });

		let results: boolean[] = [];
		try {
			if (this._checkExpired) {
				const rawData = await this._store.getMany(keys);
				const deserialized = await this.decodeWithExpire(keys, rawData as unknown[]);
				results = deserialized.map((row) => row !== undefined);
			} else {
				results = await this._store.hasMany(keys);
			}
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, keys);
			results = keys.map(() => false);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_HAS_MANY, { keys, values: results });
		return results;
	}

	/**
	 * Clear the store
	 * @returns {void}
	 */
	public async clear(): Promise<void> {
		this.emit("clear");

		await this.hook(KeyvHooks.BEFORE_CLEAR, { namespace: this._namespace });

		try {
			await this._store.clear();
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR);
		}

		await this.hook(KeyvHooks.AFTER_CLEAR, { namespace: this._namespace });
	}

	/**
	 * Will disconnect the store. This is only available if the store has a disconnect method
	 * @returns {Promise<void>}
	 */
	public async disconnect(): Promise<void> {
		this.emit("disconnect");

		await this.hook(KeyvHooks.BEFORE_DISCONNECT, { namespace: this._namespace });

		try {
			if (this._store.disconnect) {
				await this._store.disconnect();
			}
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
		}

		await this.hook(KeyvHooks.AFTER_DISCONNECT, { namespace: this._namespace });
	}

	/**
	 * Iterate over all key-value pairs in the store. Automatically deserializes values,
	 * filters out expired entries, and deletes them from the store.
	 * @returns {AsyncGenerator<Array<string | unknown>, void>} An async generator yielding `[key, value]` pairs.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: iterator yields vary by store
	public async *iterator(): AsyncGenerator<[string, any], void> {
		/* v8 ignore next 3 -- @preserve */
		if (this._store.iterator === undefined) {
			return;
		}

		for await (const [key, raw] of this._store.iterator()) {
			const data = await this.decode(raw as string);

			if (this._checkExpired && data && isDataExpired(data)) {
				await this.delete(key as string);
				continue;
			}

			yield [key as string, data?.value];
		}
	}

	/**
	 * Encodes a value for storage. Pipeline: serialize → compress → encrypt.
	 * If serialization is not configured, returns the data as-is.
	 * @param {KeyvValue<T>} data The value envelope to encode.
	 * @returns {Promise<unknown>} The encoded value, or the original data on failure.
	 */
	public async encode<T>(data: KeyvValue<T>): Promise<unknown> {
		if (!this._serialization) {
			return data;
		}

		let result: string = await this._serialization.stringify(data);

		if (this._compression?.compress) {
			result = await this._compression.compress(result);
		}

		if (this._encryption?.encrypt) {
			result = await this._encryption.encrypt(result);
		}

		return result;
	}

	/**
	 * Decodes a stored value. Pipeline: decrypt → decompress → deserialize (reverse of encode).
	 * If serialization is not configured, returns the data as a KeyvValue or undefined for strings.
	 * @param {unknown} data The raw data from the store.
	 * @returns {Promise<KeyvValue<T> | undefined>} The decoded value envelope, or undefined on failure.
	 */
	public async decode<T>(data: unknown): Promise<KeyvValue<T> | undefined> {
		if (data === undefined || data === null) {
			return undefined;
		}

		if (!this._serialization) {
			return typeof data === "string" ? undefined : (data as KeyvValue<T>);
		}

		try {
			let result: unknown = data;

			if (this._encryption?.decrypt) {
				result = await this._encryption.decrypt(result as string);
			}

			if (this._compression?.decompress) {
				result = await this._compression.decompress(result as string);
			}

			if (typeof result === "string") {
				return await this._serialization.parse<KeyvValue<T>>(result);
			}

			return result as KeyvValue<T>;
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			return undefined;
		}
	}

	/**
	 * Deserializes raw data from the store, checks for expiry, and deletes expired keys.
	 * Accepts a single key/value or arrays. Returns an array of decoded KeyvValue objects
	 * (undefined for missing or expired entries).
	 * @param {string | string[]} keys the key(s) to process
	 * @param {unknown | unknown[]} rawData the raw data from the store
	 * @returns {Promise<Array<KeyvValue<Value> | undefined>>} decoded values with expired entries removed
	 */
	public async decodeWithExpire<Value>(
		keys: string | string[],
		rawData: unknown | unknown[],
	): Promise<Array<KeyvValue<Value> | undefined>> {
		const keyArray = Array.isArray(keys) ? keys : [keys];
		const dataArray = Array.isArray(rawData) ? (rawData as unknown[]) : [rawData];

		const results: Array<KeyvValue<Value> | undefined> = [];

		for (const row of dataArray) {
			if (row === undefined || row === null) {
				results.push(undefined);
				continue;
			}

			const deserialized =
				typeof row === "string"
					? await this.decode<Value>(row as string)
					: (row as KeyvValue<Value>);

			if (deserialized === undefined || deserialized === null) {
				results.push(undefined);
				continue;
			}

			results.push(deserialized);
		}

		await deleteExpiredKeys(keyArray, results, this);

		return results;
	}

	/**
	 * Fires a hook under its new name and also under the deprecated alias (if any),
	 * so that integrations still subscribing to the old PRE_/POST_ names keep working.
	 */
	private async hookWithDeprecated(
		event: string,
		// biome-ignore lint/suspicious/noExplicitAny: hook data varies
		...args: any[]
	): Promise<void> {
		await this.hook(event, ...args);
		const deprecated = deprecatedHookAliases.get(event);
		if (deprecated && this.getHooks(deprecated)?.length) {
			await this.hook(deprecated, ...args);
		}
	}

	/**
	 * Emit a telemetry event for cache operations.
	 * @param {KeyvEvents} event the telemetry event type
	 * @param {string | string[]} [key] the cache key or keys (emits one event per key)
	 */
	private emitTelemetry(event: KeyvEvents, key?: string | string[]): void {
		const keys = Array.isArray(key) ? key : [key];
		for (const k of keys) {
			this.emit(event, {
				event: event.replace("stat:", ""),
				key: k,
				namespace: this._namespace,
				timestamp: Date.now(),
			} as KeyvTelemetryEvent);
		}
	}

	/**
	 * Merges the overloaded constructor arguments into a single KeyvOptions object.
	 */
	private static resolveOptions(
		store?: KeyvStorageAdapter | KeyvOptions,
		options?: Omit<KeyvOptions, "store">,
	): KeyvOptions {
		options ??= {};
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		store ??= {} as KeyvOptions;
		const merged: KeyvOptions = { ...options };
		if (store && (store as KeyvStorageAdapter).get) {
			merged.store = store as KeyvStorageAdapter;
		} else {
			Object.assign(merged, store);
		}

		return merged;
	}

	/**
	 * Initializes the serialization adapter from options.
	 */
	private initSerialization(options: KeyvOptions): void {
		if (options.serialization === false) {
			this._serialization = undefined;
		} else {
			this._serialization = options.serialization ?? new KeyvJsonSerializer();
		}
	}

	/**
	 * Initializes the sanitization handler from options.
	 */
	private initSanitize(options: KeyvOptions): void {
		const sanitize = new KeyvSanitize();
		if (options.sanitize) {
			sanitize.updateOptions(options.sanitize);
		}

		this._sanitize = sanitize;
	}

	/**
	 * Initializes the stats manager from options.
	 */
	private initStats(options: KeyvOptions): void {
		this._stats = new KeyvStats({
			emitter: this,
			enabled: options.stats ?? false,
		});
	}

	/**
	 * Initializes the namespace, applying sanitization if enabled.
	 */
	private initNamespace(namespace?: string): void {
		this._namespace = namespace;
		if (this._namespace && this._sanitize.enabled) {
			this._namespace = this._sanitize.cleanNamespace(this._namespace);
		}
	}
}

export default Keyv;
