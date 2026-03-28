import { Hookified } from "hookified";
import { type KeyvMapType, KeyvMemoryAdapter } from "./adapters/memory.js";
import { detectKeyvStorage } from "./capabilities.js";
import { KeyvJsonSerializer } from "./json-serializer.js";
import { KeyvSanitize } from "./sanitize.js";
import { KeyvStats } from "./stats.js";
import {
	type KeyvCompressionAdapter,
	type KeyvEntry,
	KeyvEvents,
	KeyvHooks,
	type KeyvMapAny,
	type KeyvOptions,
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
	private _stats: KeyvStats;

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
	 * Sanitization handler for keys and namespaces. By default it is disabled.
	 */
	private _sanitize: KeyvSanitize;

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
		options ??= {};
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		store ??= {} as KeyvOptions;

		const mergedOptions: KeyvOptions = {
			...options,
		};

		if (store && (store as KeyvStorageAdapter).get) {
			mergedOptions.store = store as KeyvStorageAdapter;
		} else {
			Object.assign(mergedOptions, store);
		}

		super({
			throwOnHookError: false,
			throwOnEmptyListeners: true,
			throwOnEmitError: mergedOptions.throwOnErrors ?? false,
		});

		this.deprecatedHooks = buildDeprecatedHooks();

		if (mergedOptions.store) {
			const storeCap = detectKeyvStorage(mergedOptions.store);
			if (storeCap.mapLike) {
				this._store = new KeyvMemoryAdapter(mergedOptions.store as KeyvMapType);
			} else {
				this._store = mergedOptions.store;
			}
		}

		this._compression = mergedOptions.compression;

		if (mergedOptions.serialization === false) {
			this._serialization = undefined;
		} else {
			this._serialization = mergedOptions.serialization ?? new KeyvJsonSerializer();
		}

		this._sanitize = new KeyvSanitize();

		if (mergedOptions.sanitize) {
			this._sanitize.updateOptions(mergedOptions?.sanitize);
		}

		this._namespace = mergedOptions.namespace;
		if (this._namespace && this._sanitize.enabled) {
			this._namespace = this._sanitize.cleanNamespace(this._namespace);
		}

		/* v8 ignore next -- @preserve */
		if (this._store) {
			const storeCap = detectKeyvStorage(this._store);
			if (
				!(storeCap.mapLike || (storeCap.get && storeCap.set && storeCap.delete && storeCap.clear))
			) {
				throw new Error("Invalid storage adapter");
			}

			if (typeof this._store.on === "function") {
				// biome-ignore lint/suspicious/noExplicitAny: type format
				this._store.on(KeyvEvents.ERROR, (error: any) => this.emit(KeyvEvents.ERROR, error));
			}

			this._store.namespace = this._namespace;
		}

		this._stats = new KeyvStats({
			emitter: this,
			enabled: mergedOptions.stats ?? false,
		});

		if (mergedOptions.ttl) {
			this._ttl = mergedOptions.ttl;
		}
	}

	/**
	 * Get the current storage adapter.
	 * @returns {KeyvStorageAdapter | Map<any, any> | any} The current storage adapter.
	 */
	public get store(): KeyvStorageAdapter | KeyvMapAny {
		return this._store;
	}

	/**
	 * Set the storage adapter. Also configures the namespace, error forwarding, and iterator
	 * for the new store. Throws if the store does not implement the required methods.
	 * @param {KeyvStorageAdapter | Map<any, any> | any} store The storage adapter to set.
	 * @throws {Error} If the store is not a valid storage adapter.
	 */
	public set store(store: KeyvStorageAdapter | KeyvMapAny) {
		const storeCap = detectKeyvStorage(store);
		if (storeCap.mapLike || (storeCap.get && storeCap.set && storeCap.delete && storeCap.clear)) {
			this._store = storeCap.mapLike ? new KeyvMemoryAdapter(store as KeyvMapType) : store;

			if (typeof store.on === "function") {
				// biome-ignore lint/suspicious/noExplicitAny: type format
				store.on(KeyvEvents.ERROR, (error: any) => this.emit(KeyvEvents.ERROR, error));
			}
			/* v8 ignore next -- @preserve */
			if (this._namespace) {
				this._store.namespace = this._namespace;
			}
		} else {
			throw new Error("Invalid storage adapter");
		}
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
		this._ttl = ttl;
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
	 * Get the current throwOnErrors value. When enabled, errors will throw if there are no error listeners registered.
	 * @return {boolean} The current throwOnErrors value.
	 */
	public get throwOnErrors(): boolean {
		return this.throwOnEmitError;
	}

	/**
	 * Set the current throwOnErrors value. When enabled, errors will throw if there are no error listeners registered.
	 * @param {boolean} value The throwOnErrors value to set.
	 */
	public set throwOnErrors(value: boolean) {
		this.throwOnEmitError = value;
	}

	/**
	 * Get the current KeyvSanitize instance.
	 * @returns {KeyvSanitize} The current KeyvSanitize instance.
	 */
	public get sanitize(): KeyvSanitize {
		return this._sanitize;
	}

	/**
	 * Set the sanitize instance directly.
	 * @param {KeyvSanitize} value The KeyvSanitize instance to use.
	 */
	public set sanitize(value: KeyvSanitize) {
		this._sanitize = value;
		/* v8 ignore next -- @preserve */
		this._namespace =
			this._namespace && this._sanitize.enabled
				? this._sanitize.cleanNamespace(this._namespace)
				: this._namespace;
	}

	/**
	 * Get the stats manager.
	 * @returns {KeyvStats} The current stats manager.
	 */
	public get stats(): KeyvStats {
		return this._stats;
	}

	/**
	 * Set the stats manager.
	 * @param {KeyvStats} stats The stats manager to set.
	 */
	public set stats(stats: KeyvStats) {
		this._stats.unsubscribe();
		this._stats = stats;
		this._stats.subscribe(this);
	}

	/**
	 * Emit a telemetry event for cache operations.
	 * @param {KeyvEvents} event the telemetry event type
	 * @param {string | string[]} [key] the cache key or keys (emits one event per key)
	 */
	public emitTelemetry(event: KeyvEvents, key?: string | string[]): void {
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
	 * Get the Value of a Key
	 * @param {string | string[]} key passing in a single key or multiple as an array
	 */
	public async get<Value = GenericValue>(key: string): Promise<Value | undefined>;
	public async get<Value = GenericValue>(key: string[]): Promise<Array<Value | undefined>>;
	public async get<Value = GenericValue>(
		key: string | string[],
	): Promise<Value | undefined | Array<Value | undefined>> {
		const store = this._store;
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
			rawData = await store.get<Value>(key as string);
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key as string);
		}

		const deserializedData =
			typeof rawData === "string" || this._compression
				? await this.deserializeData<Value>(rawData as string)
				: rawData;

		if (deserializedData === undefined || deserializedData === null) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
				key,
				value: undefined,
			});
			this.emitTelemetry(KeyvEvents.STAT_MISS, key as string);
			return undefined;
		}

		if (isDataExpired(deserializedData as KeyvValue<Value>)) {
			await this.delete(key as string);
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
				key,
				value: undefined,
			});
			this.emitTelemetry(KeyvEvents.STAT_MISS, key as string);
			return undefined;
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
			key,
			value: deserializedData,
		});
		this.emitTelemetry(KeyvEvents.STAT_HIT, key as string);
		return (deserializedData as KeyvValue<Value>).value;
	}

	/**
	 * Get many values of keys
	 * @param {string[]} keys passing in a single key or multiple as an array
	 */
	public async getMany<Value = GenericValue>(keys: string[]): Promise<Array<Value | undefined>> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;
		const store = this._store;

		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET_MANY, { keys });
		if (store.getMany === undefined) {
			const promises = keys.map(async (key: string) => {
				const rawData = await store.get<Value>(key);
				const deserializedRow =
					typeof rawData === "string" || this._compression
						? await this.deserializeData<Value>(rawData as string)
						: rawData;

				if (deserializedRow === undefined || deserializedRow === null) {
					return undefined;
				}

				if (isDataExpired(deserializedRow as KeyvValue<Value>)) {
					await this.delete(key);
					return undefined;
				}

				return (deserializedRow as KeyvValue<Value>).value;
			});

			const deserializedRows = await Promise.allSettled(promises);
			const result = deserializedRows.map((row) =>
				/* v8 ignore next -- @preserve */
				row.status === "fulfilled" ? row.value : undefined,
			);
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY, result);
			for (let i = 0; i < result.length; i++) {
				if (result[i] === undefined) {
					this.emitTelemetry(KeyvEvents.STAT_MISS, keys[i]);
				} else {
					this.emitTelemetry(KeyvEvents.STAT_HIT, keys[i]);
				}
			}

			return result;
		}

		const rawData = await store.getMany<Value>(keys);

		const deserialized: Array<KeyvValue<Value> | undefined | null> = [];
		for (const row of rawData) {
			if (typeof row === "string") {
				// eslint-disable-next-line no-await-in-loop
				deserialized.push(await this.deserializeData<Value>(row));
			} else {
				deserialized.push(row as KeyvValue<Value> | undefined | null);
			}
		}

		await deleteExpiredKeys(keys, deserialized, this);

		const result: Array<Value | undefined> = deserialized.map((row) =>
			row !== undefined && row !== null ? row.value : undefined,
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
	 * @returns {Promise<StoredDataRaw<Value> | undefined>} will return a StoredDataRaw<Value> or undefined if the key does not exist or is expired.
	 */
	public async getRaw<Value = GenericValue>(
		key: string,
	): Promise<StoredDataRaw<Value> | undefined> {
		key = this._sanitize.enabled ? this._sanitize.cleanKey(key) : key;
		if (key === "") {
			return undefined;
		}

		const store = this._store;
		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET_RAW, { key });
		const rawData = await store.get(key);

		if (rawData === undefined || rawData === null) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
				key,
				value: undefined,
			});
			this.emitTelemetry(KeyvEvents.STAT_MISS, key);
			return undefined;
		}

		// Check if the data is expired
		/* v8 ignore next -- @preserve */
		const deserializedData =
			typeof rawData === "string" || this._compression
				? await this.deserializeData<Value>(rawData as string)
				: rawData;

		if (deserializedData !== undefined && isDataExpired(deserializedData as KeyvValue<Value>)) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
				key,
				value: undefined,
			});
			this.emitTelemetry(KeyvEvents.STAT_MISS, key);
			await this.delete(key);
			return undefined;
		}

		// Add a hit
		this.emitTelemetry(KeyvEvents.STAT_HIT, key);

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
			key,
			value: deserializedData,
		});

		return deserializedData;
	}

	/**
	 * Get the raw values of many keys. This is the replacement for setting raw to true in the getMany() method.
	 * @param {string[]} keys the keys to get
	 * @returns {Promise<Array<StoredDataRaw<Value>>>} will return an array of StoredDataRaw<Value> or undefined if the key does not exist or is expired.
	 */
	public async getManyRaw<Value = GenericValue>(
		keys: string[],
	): Promise<Array<StoredDataRaw<Value>>> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;
		const store = this._store;

		if (keys.length === 0) {
			const result = Array.from({ length: keys.length }).fill(undefined) as Array<
				StoredDataRaw<Value>
			>;
			/* v8 ignore next 3 -- @preserve */
			for (const key of keys) {
				this.emitTelemetry(KeyvEvents.STAT_MISS, key);
			}

			// Trigger the after get many raw hook
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY_RAW, {
				keys,
				values: result,
			});
			return result;
		}

		let result: Array<StoredDataRaw<Value>> = [];
		// Check to see if the store has a getMany method
		if (store.getMany === undefined) {
			// If not then we will get each key individually
			const promises = keys.map(async (key: string) => {
				const rawData = await store.get<Value>(key);
				if (rawData !== undefined && rawData !== null) {
					return this.deserializeData<Value>(rawData as string);
				}

				return undefined;
			});

			const deserializedRows = await Promise.allSettled(promises);
			result = deserializedRows.map(
				(row: PromiseSettledResult<StoredDataRaw<Value> | undefined>) =>
					/* v8 ignore next -- @preserve */
					row.status === "fulfilled" ? row.value : undefined,
			) as Array<StoredDataRaw<Value>>;
		} else {
			const rawData = await store.getMany(keys);

			for (const row of rawData) {
				/* v8 ignore next -- @preserve */
				if (row !== undefined && row !== null) {
					result.push(await this.deserializeData<Value>(row));
				} else {
					/* v8 ignore next -- @preserve */
					result.push(undefined);
				}
			}
		}

		// Filter out any expired keys and delete them
		await deleteExpiredKeys(keys, result, this);

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
		return result;
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

		const store = this._store;

		const expires = typeof data.ttl === "number" ? Date.now() + data.ttl : undefined;

		if (typeof data.value === "symbol") {
			this.emit(KeyvEvents.ERROR, "symbol cannot be serialized");
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key);
			throw new Error("symbol cannot be serialized");
		}

		const formattedValue = { value: data.value, expires };
		const serializedValue = await this.serializeData(formattedValue);

		let result = true;

		try {
			const value = await store.set(data.key, serializedValue, data.ttl);

			if (typeof value === "boolean") {
				result = value;
			}
		} catch (error) {
			result = false;
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET, {
			key,
			value: serializedValue,
			ttl,
		});
		this.emitTelemetry(KeyvEvents.STAT_SET, key);

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
		let results: boolean[] = [];

		try {
			// If the store doesn't have a setMany method then fall back to setting each entry individually
			if (this._store.setMany === undefined) {
				const promises: Array<Promise<boolean>> = [];
				for (const entry of entries) {
					promises.push(this.set(entry.key, entry.value, entry.ttl));
				}

				const promiseResults = await Promise.all(promises);
				results = promiseResults;
			} else {
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
						const serializedValue = await this.serializeData(formattedValue);
						return { key, value: serializedValue, ttl };
					}),
				);
				const storeResult = await this._store.setMany(serializedEntries);
				/* v8 ignore next -- @preserve */
				results = Array.isArray(storeResult) ? (storeResult as boolean[]) : entries.map(() => true);
				this.emitTelemetry(
					KeyvEvents.STAT_SET,
					entries.map((e) => e.key),
				);
			}
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(
				KeyvEvents.STAT_ERROR,
				entries.map((e) => e.key),
			);

			results = entries.map(() => false);
		}

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

		const store = this._store;
		let result = true;

		try {
			const serializedValue = await this.serializeData(data.value);
			const storeResult = await store.set(data.key, serializedValue, ttl);

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
		this.emitTelemetry(KeyvEvents.STAT_SET, key);

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
			key: this._sanitize.enabled ? this._sanitize.cleanKey(e.key) : e.key,
		}));
		let results: boolean[] = [];

		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET_MANY_RAW, { entries });

		try {
			if (this._store.setMany === undefined) {
				const promises: Array<Promise<boolean>> = [];
				for (const entry of entries) {
					promises.push(this.setRaw(entry.key, entry.value));
				}

				results = await Promise.all(promises);
			} else {
				const rawEntries = await Promise.all(
					entries.map(async ({ key, value }) => {
						const ttl = ttlFromExpires(value.expires);
						const serializedValue = await this.serializeData(value);
						return { key, value: serializedValue, ttl };
					}),
				);
				const storeResult = await this._store.setMany(rawEntries);
				results = Array.isArray(storeResult) ? (storeResult as boolean[]) : entries.map(() => true);
				this.emitTelemetry(
					KeyvEvents.STAT_SET,
					entries.map((e) => e.key),
				);
			}
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
		const store = this._store;
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
			const value = await store.delete(key);

			/* v8 ignore next -- @preserve */
			if (typeof value === "boolean") {
				result = value;
			}
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
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;
		try {
			const store = this._store;
			await this.hookWithDeprecated(KeyvHooks.BEFORE_DELETE, { key: keys });
			if (store.deleteMany !== undefined) {
				const storeResult = await store.deleteMany(keys);
				// Support adapters that still return a single boolean
				const results = Array.isArray(storeResult) ? storeResult : keys.map(() => storeResult);
				this.emitTelemetry(KeyvEvents.STAT_DELETE, keys);
				await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
					key: keys,
					value: results,
				});
				return results;
			}

			const promises = keys.map(async (key: string) => store.delete(key));

			const results = await Promise.all(promises);
			this.emitTelemetry(KeyvEvents.STAT_DELETE, keys);
			await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
				key: keys,
				value: results,
			});
			return results;
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, keys);

			return keys.map(() => false);
		}
	}

	/**
	 * Has a key
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

		const store = this._store;
		if (store.has !== undefined && !(store instanceof KeyvMemoryAdapter)) {
			return store.has(key);
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let rawData: any;

		try {
			rawData = await store.get(key);
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR, key as string);

			return false;
		}

		if (rawData) {
			// biome-ignore lint/suspicious/noExplicitAny: type format
			const data = (await this.deserializeData(rawData)) as any;
			/* v8 ignore next -- @preserve */
			if (data) {
				return !isDataExpired(data);
			}
		}

		return false;
	}

	/**
	 * Check if many keys exist
	 * @param {string[]} keys the keys to check
	 * @returns {boolean[]} will return an array of booleans if the keys exist
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		keys = this._sanitize.enabled ? this._sanitize.cleanKeys(keys) : keys;
		const store = this._store;
		if (store.hasMany !== undefined) {
			return store.hasMany(keys);
		}

		/* v8 ignore next -- @preserve */
		return Promise.all(keys.map(async (key) => this.has(key)));
	}

	/**
	 * Clear the store
	 * @returns {void}
	 */
	public async clear(): Promise<void> {
		this.emit("clear");
		const store = this._store;

		try {
			await store.clear();
		} catch (error) {
			this.emit(KeyvEvents.ERROR, error);
			this.emitTelemetry(KeyvEvents.STAT_ERROR);
		}
	}

	/**
	 * Will disconnect the store. This is only available if the store has a disconnect method
	 * @returns {Promise<void>}
	 */
	public async disconnect(): Promise<void> {
		const store = this._store;
		this.emit("disconnect");
		if (typeof store.disconnect === "function") {
			return store.disconnect();
		}
	}

	/**
	 * Iterate over all key-value pairs in the store. Automatically deserializes values,
	 * filters out expired entries, and deletes them from the store.
	 * @returns {AsyncGenerator<Array<string | unknown>, void>} An async generator yielding `[key, value]` pairs.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: iterator yields vary by store
	public async *iterator(): AsyncGenerator<[string, any], void> {
		const store = this._store;

		if (typeof store.iterator === "function") {
			for await (const [key, raw] of store.iterator()) {
				const data = await this.deserializeData(raw as string);

				if (data && isDataExpired(data)) {
					await this.delete(key as string);
					continue;
				}

				yield [key as string, data?.value];
			}
		} else {
			this.emit(KeyvEvents.ERROR, new Error("Iterator not supported by this storage adapter"));
			this.emitTelemetry(KeyvEvents.STAT_ERROR);
		}
	}

	public async serializeData<T>(data: KeyvValue<T>): Promise<string | KeyvValue<T>> {
		// Pipeline: serialize (optional) -> compress (optional)
		if (!this._serialization && !this._compression) {
			return data;
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let result: any = data;

		/* v8 ignore next 7 -- @preserve */
		if (this._serialization) {
			result = await this._serialization.stringify(data);
		} else if (this._compression) {
			// Compression needs string input; use JSON as minimum serialization
			result = JSON.stringify(data);
		}

		if (this._compression?.compress) {
			result = await this._compression.compress(result);
		}

		return result;
	}

	public async deserializeData<T>(data: string | KeyvValue<T>): Promise<KeyvValue<T> | undefined> {
		if (data === undefined || data === null) {
			return undefined;
		}

		// Pipeline: decompress (optional) -> parse (optional)
		if (!this._serialization && !this._compression) {
			if (typeof data === "string") {
				return undefined;
			}

			return data as KeyvValue<T>;
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let result: any = data;

		if (this._compression?.decompress) {
			result = await this._compression.decompress(result);
		}

		if (this._serialization && typeof result === "string") {
			return await this._serialization.parse<KeyvValue<T>>(result);
		}

		// If compression was used without serialization, JSON was used as fallback
		if (typeof result === "string") {
			try {
				return JSON.parse(result) as KeyvValue<T>;
			} catch {
				return undefined;
			}
		}

		return result as KeyvValue<T>;
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
}

export default Keyv;
