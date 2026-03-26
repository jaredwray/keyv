import { Hookified } from "hookified";
import { KeyvJsonSerializer } from "./json-serializer.js";
import StatsManager from "./stats-manager.js";
import {
	type DeserializedData,
	type KeyvCompressionAdapter,
	type KeyvEntry,
	KeyvHooks,
	type KeyvOptions,
	type KeyvSerializationAdapter,
	type KeyvStorageAdapter,
	type StoredDataRaw,
} from "./types.js";

export type {
	IsKeyvCompressionResult,
	IsKeyvEncryptionResult,
	IsKeyvResult,
	IsKeyvSerializationResult,
	IsKeyvStorageResult,
	KeyvStorageMethodType,
} from "./capabilities.js";
export {
	isKeyv,
	isKeyvCompression,
	isKeyvEncryption,
	isKeyvSerialization,
	isKeyvStorage,
} from "./capabilities.js";
export { jsonSerializer, KeyvJsonSerializer } from "./json-serializer.js";
export type {
	DeserializedData,
	KeyvCompression,
	KeyvCompressionAdapter,
	KeyvEntry,
	KeyvOptions,
	KeyvSerializationAdapter,
	KeyvStorageAdapter,
	KeyvStoreAdapter,
	StoredData,
	StoredDataNoRaw,
	StoredDataRaw,
} from "./types.js";
export { KeyvHooks } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: type format
type IteratorFunction = (argument?: any) => AsyncGenerator<any, void>;

/**
 * Maps new hook names to their deprecated equivalents so both fire during migration.
 */
const deprecatedHookAliases = new Map<string, string>([
	[KeyvHooks.BEFORE_SET, KeyvHooks.PRE_SET],
	[KeyvHooks.AFTER_SET, KeyvHooks.POST_SET],
	[KeyvHooks.BEFORE_GET, KeyvHooks.PRE_GET],
	[KeyvHooks.AFTER_GET, KeyvHooks.POST_GET],
	[KeyvHooks.BEFORE_GET_MANY, KeyvHooks.PRE_GET_MANY],
	[KeyvHooks.AFTER_GET_MANY, KeyvHooks.POST_GET_MANY],
	[KeyvHooks.BEFORE_GET_RAW, KeyvHooks.PRE_GET_RAW],
	[KeyvHooks.AFTER_GET_RAW, KeyvHooks.POST_GET_RAW],
	[KeyvHooks.BEFORE_GET_MANY_RAW, KeyvHooks.PRE_GET_MANY_RAW],
	[KeyvHooks.AFTER_GET_MANY_RAW, KeyvHooks.POST_GET_MANY_RAW],
	[KeyvHooks.BEFORE_SET_RAW, KeyvHooks.PRE_SET_RAW],
	[KeyvHooks.AFTER_SET_RAW, KeyvHooks.POST_SET_RAW],
	[KeyvHooks.BEFORE_SET_MANY_RAW, KeyvHooks.PRE_SET_MANY_RAW],
	[KeyvHooks.AFTER_SET_MANY_RAW, KeyvHooks.POST_SET_MANY_RAW],
	[KeyvHooks.BEFORE_DELETE, KeyvHooks.PRE_DELETE],
	[KeyvHooks.AFTER_DELETE, KeyvHooks.POST_DELETE],
]);

// biome-ignore lint/suspicious/noExplicitAny: type format
export class Keyv<GenericValue = any> extends Hookified {
	iterator?: IteratorFunction;
	stats = new StatsManager(false);

	/**
	 * Time to live in milliseconds
	 */
	private _ttl?: number;

	/**
	 * Namespace
	 */
	private _namespace?: string;

	/**
	 * Store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	private _store: KeyvStorageAdapter = new Map() as any;

	private _serialization: KeyvSerializationAdapter | undefined;

	private _compression: KeyvCompressionAdapter | undefined;

	/**
	 * Keyv Constructor
	 * @param {KeyvStorageAdapter | KeyvOptions | Map<any, any>} store  to be provided or just the options
	 * @param {Omit<KeyvOptions, 'store'>} [options] if you provide the store you can then provide the Keyv Options
	 */
	constructor(
		// biome-ignore lint/suspicious/noExplicitAny: type format
		store?: KeyvStorageAdapter | KeyvOptions | Map<any, any>,
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
	constructor(
		store?: KeyvStorageAdapter | KeyvOptions,
		options?: Omit<KeyvOptions, "store">,
	) {
		options ??= {};
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		store ??= {} as KeyvOptions;

		const mergedOptions: KeyvOptions = {
			namespace: "keyv",
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

		this.deprecatedHooks = new Map([
			["preSet", "Use KeyvHooks.BEFORE_SET ('before:set') instead"],
			["postSet", "Use KeyvHooks.AFTER_SET ('after:set') instead"],
			["preGet", "Use KeyvHooks.BEFORE_GET ('before:get') instead"],
			["postGet", "Use KeyvHooks.AFTER_GET ('after:get') instead"],
			[
				"preGetMany",
				"Use KeyvHooks.BEFORE_GET_MANY ('before:getMany') instead",
			],
			["postGetMany", "Use KeyvHooks.AFTER_GET_MANY ('after:getMany') instead"],
			["preGetRaw", "Use KeyvHooks.BEFORE_GET_RAW ('before:getRaw') instead"],
			["postGetRaw", "Use KeyvHooks.AFTER_GET_RAW ('after:getRaw') instead"],
			[
				"preGetManyRaw",
				"Use KeyvHooks.BEFORE_GET_MANY_RAW ('before:getManyRaw') instead",
			],
			[
				"postGetManyRaw",
				"Use KeyvHooks.AFTER_GET_MANY_RAW ('after:getManyRaw') instead",
			],
			["preSetRaw", "Use KeyvHooks.BEFORE_SET_RAW ('before:setRaw') instead"],
			["postSetRaw", "Use KeyvHooks.AFTER_SET_RAW ('after:setRaw') instead"],
			[
				"preSetManyRaw",
				"Use KeyvHooks.BEFORE_SET_MANY_RAW ('before:setManyRaw') instead",
			],
			[
				"postSetManyRaw",
				"Use KeyvHooks.AFTER_SET_MANY_RAW ('after:setManyRaw') instead",
			],
			["preDelete", "Use KeyvHooks.BEFORE_DELETE ('before:delete') instead"],
			["postDelete", "Use KeyvHooks.AFTER_DELETE ('after:delete') instead"],
		]);

		this._store = mergedOptions.store ?? new Map();

		this._compression = mergedOptions.compression;

		if (mergedOptions.serialization === false) {
			this._serialization = undefined;
		} else {
			this._serialization =
				mergedOptions.serialization ?? new KeyvJsonSerializer();
		}

		/* v8 ignore next -- @preserve */
		if (mergedOptions.namespace) {
			this._namespace = mergedOptions.namespace;
		}

		/* v8 ignore next -- @preserve */
		if (this._store) {
			if (!this._isValidStorageAdapter(this._store)) {
				throw new Error("Invalid storage adapter");
			}

			if (typeof this._store.on === "function") {
				// biome-ignore lint/suspicious/noExplicitAny: type format
				this._store.on("error", (error: any) => this.emit("error", error));
			}

			this._store.namespace = this._namespace;

			// Attach iterators
			if (
				// biome-ignore lint/suspicious/noExplicitAny: need to check Map iterator
				typeof (this._store as any)[Symbol.iterator] === "function" &&
				this._store instanceof Map
			) {
				this.iterator = this.generateIterator(
					this._store as unknown as IteratorFunction,
				);
			} else if ("iterator" in this._store) {
				this.iterator = this.generateIterator(
					// biome-ignore lint/style/noNonNullAssertion: need to fix
					this._store.iterator!.bind(this._store),
				);
			} else {
				this.iterator = this.generateFallbackIterator();
			}
		}

		if (mergedOptions.stats) {
			this.stats.enabled = mergedOptions.stats;
		}

		if (mergedOptions.ttl) {
			this._ttl = mergedOptions.ttl;
		}
	}

	/**
	 * Get the current store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get store(): KeyvStorageAdapter | Map<any, any> | any {
		return this._store;
	}

	/**
	 * Set the current store. This will also set the namespace, event error handler, and generate the iterator. If the store is not valid it will throw an error.
	 * @param {KeyvStorageAdapter | Map<any, any> | any} store the store to set
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public set store(store: KeyvStorageAdapter | Map<any, any> | any) {
		if (this._isValidStorageAdapter(store)) {
			this._store = store;

			if (typeof store.on === "function") {
				// biome-ignore lint/suspicious/noExplicitAny: type format
				store.on("error", (error: any) => this.emit("error", error));
			}
			/* v8 ignore next -- @preserve */
			if (this._namespace) {
				this._store.namespace = this._namespace;
			}

			if (
				typeof store[Symbol.iterator] === "function" &&
				store instanceof Map
			) {
				this.iterator = this.generateIterator(
					store as unknown as IteratorFunction,
				);
				/* v8 ignore next -- @preserve */
			} else if ("iterator" in store) {
				this.iterator = this.generateIterator(store.iterator?.bind(store));
			} else {
				this.iterator = this.generateFallbackIterator();
			}
		} else {
			throw new Error("Invalid storage adapter");
		}
	}

	/**
	 * Get the current compression function
	 * @returns {KeyvCompressionAdapter} The current compression function
	 */
	public get compression(): KeyvCompressionAdapter | undefined {
		return this._compression;
	}

	/**
	 * Set the current compression function
	 * @param {KeyvCompressionAdapter} compress The compression function to set
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
		this._namespace = namespace;
		this._store.namespace = namespace;
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
	 * Get the current serialization adapter.
	 * @returns {KeyvSerializationAdapter | undefined} The current serialization adapter.
	 */
	public get serialization(): KeyvSerializationAdapter | undefined {
		return this._serialization;
	}

	/**
	 * Set the current serialization adapter.
	 * @param {KeyvSerializationAdapter | undefined} serialization The serialization adapter to set.
	 */
	public set serialization(serialization:
		| KeyvSerializationAdapter
		| false
		| undefined) {
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

	generateIterator(iterator: IteratorFunction): IteratorFunction {
		// biome-ignore lint/suspicious/noExplicitAny: type format
		const function_: IteratorFunction = async function* (this: any) {
			for await (const [key, raw] of typeof iterator === "function"
				? iterator()
				: iterator) {
				const data = await this.deserializeData(raw);

				if (typeof data.expires === "number" && Date.now() > data.expires) {
					await this.delete(key);
					continue;
				}

				yield [key, data.value];
			}
		};

		return function_.bind(this);
	}

	generateFallbackIterator(): IteratorFunction {
		// biome-ignore lint/suspicious/noExplicitAny: type format
		// biome-ignore lint/correctness/useYield: fallback iterator intentionally yields nothing
		const function_: IteratorFunction = async function* (this: any) {
			this.emit(
				"error",
				new Error("Iterator not supported by this storage adapter"),
			);
		};

		return function_.bind(this);
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

	// biome-ignore lint/suspicious/noExplicitAny: type format
	_isValidStorageAdapter(store: KeyvStorageAdapter | any): boolean {
		return (
			store instanceof Map ||
			(typeof store.get === "function" &&
				typeof store.set === "function" &&
				typeof store.delete === "function" &&
				typeof store.clear === "function")
		);
	}

	/**
	 * Get the Value of a Key
	 * @param {string | string[]} key passing in a single key or multiple as an array
	 */
	async get<Value = GenericValue>(key: string): Promise<Value | undefined>;
	async get<Value = GenericValue>(
		key: string[],
	): Promise<Array<Value | undefined>>;
	async get<Value = GenericValue>(
		key: string | string[],
	): Promise<Value | undefined | Array<Value | undefined>> {
		const store = this._store;
		const isArray = Array.isArray(key);

		const isDataExpired = (data: DeserializedData<Value>): boolean =>
			typeof data.expires === "number" && Date.now() > data.expires;

		if (isArray) {
			return this.getMany<Value>(key);
		}

		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET, { key });
		// biome-ignore lint/suspicious/noImplicitAnyLet: need to fix
		let rawData;
		try {
			rawData = await store.get<Value>(key as string);
		} catch (error) {
			this.emit("error", error);
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
			this.stats.miss();
			return undefined;
		}

		if (isDataExpired(deserializedData as DeserializedData<Value>)) {
			await this.delete(key);
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
				key,
				value: undefined,
			});
			this.stats.miss();
			return undefined;
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET, {
			key,
			value: deserializedData,
		});
		this.stats.hit();
		return (deserializedData as DeserializedData<Value>).value;
	}

	/**
	 * Get many values of keys
	 * @param {string[]} keys passing in a single key or multiple as an array
	 */
	public async getMany<Value = GenericValue>(
		keys: string[],
	): Promise<Array<Value | undefined>> {
		const store = this._store;

		const isDataExpired = (data: DeserializedData<Value>): boolean =>
			typeof data.expires === "number" && Date.now() > data.expires;

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

				if (isDataExpired(deserializedRow as DeserializedData<Value>)) {
					await this.delete(key);
					return undefined;
				}

				return (deserializedRow as DeserializedData<Value>).value;
			});

			const deserializedRows = await Promise.allSettled(promises);
			const result = deserializedRows.map(
				// biome-ignore lint/suspicious/noExplicitAny: type format
				(row) => (row as PromiseFulfilledResult<any>).value,
			);
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY, result);
			if (result.length > 0) {
				this.stats.hit();
			}

			return result;
		}

		const rawData = await store.getMany<Value>(keys);

		const result = [];
		const expiredKeys = [];
		// eslint-disable-next-line guard-for-in, @typescript-eslint/no-for-in-array
		for (const index in rawData) {
			let row = rawData[index];

			if (typeof row === "string") {
				// eslint-disable-next-line no-await-in-loop
				row = await this.deserializeData<Value>(row);
			}

			if (row === undefined || row === null) {
				result.push(undefined);
				continue;
			}

			if (isDataExpired(row as DeserializedData<Value>)) {
				expiredKeys.push(keys[index]);
				result.push(undefined);
				continue;
			}

			result.push((row as DeserializedData<Value>).value);
		}

		if (expiredKeys.length > 0) {
			await this.deleteMany(expiredKeys);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_GET_MANY, result);
		/* v8 ignore next -- @preserve */
		if (result.length > 0) {
			this.stats.hit();
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
		const store = this._store;
		await this.hookWithDeprecated(KeyvHooks.BEFORE_GET_RAW, { key });
		const rawData = await store.get(key);

		if (rawData === undefined || rawData === null) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
				key,
				value: undefined,
			});
			this.stats.miss();
			return undefined;
		}

		// Check if the data is expired
		/* v8 ignore next -- @preserve */
		const deserializedData =
			typeof rawData === "string" || this._compression
				? await this.deserializeData<Value>(rawData as string)
				: rawData;

		if (
			deserializedData !== undefined &&
			(deserializedData as DeserializedData<Value>).expires !== undefined &&
			(deserializedData as DeserializedData<Value>).expires !== null &&
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			(deserializedData as DeserializedData<Value>).expires! < Date.now()
		) {
			await this.hookWithDeprecated(KeyvHooks.AFTER_GET_RAW, {
				key,
				value: undefined,
			});
			this.stats.miss();
			await this.delete(key);
			return undefined;
		}

		// Add a hit
		this.stats.hit();

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
		const store = this._store;

		if (keys.length === 0) {
			const result = Array.from({ length: keys.length }).fill(
				undefined,
			) as Array<StoredDataRaw<Value>>;
			// Add in misses
			this.stats.misses += keys.length;
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
					// biome-ignore lint/suspicious/noExplicitAny: type format
					(row as PromiseFulfilledResult<any>).value,
			);
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
		const expiredKeys = [];
		const isDataExpired = (data: DeserializedData<Value>): boolean =>
			typeof data.expires === "number" && Date.now() > data.expires;

		for (const [index, row] of result.entries()) {
			if (row !== undefined && isDataExpired(row)) {
				expiredKeys.push(keys[index]);
				result[index] = undefined;
			}
		}

		if (expiredKeys.length > 0) {
			await this.deleteMany(expiredKeys);
		}

		// Add in hits and misses
		this.stats.hitsOrMisses(result);
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
	async set<Value = GenericValue>(
		key: string,
		value: Value,
		ttl?: number,
	): Promise<boolean> {
		const data = { key, value, ttl };
		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET, data);

		data.ttl ??= this._ttl;

		if (data.ttl === 0) {
			data.ttl = undefined;
		}

		const store = this._store;

		const expires =
			typeof data.ttl === "number" ? Date.now() + data.ttl : undefined;

		if (typeof data.value === "symbol") {
			this.emit("error", "symbol cannot be serialized");
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
			this.emit("error", error);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET, {
			key,
			value: serializedValue,
			ttl,
		});
		this.stats.set();

		return result;
	}

	/**
	 * Set a raw value to the store without wrapping or serialization. This is the write-side counterpart to getRaw().
	 * The value should be a DeserializedData object with { value, expires? }. If you need TTL-based expiration,
	 * set `expires` on the value directly (e.g. `{ value: 'bar', expires: Date.now() + 60000 }`).
	 * The store-level TTL is derived automatically from `value.expires`.
	 * @param {string} key the key to set
	 * @param {DeserializedData<Value>} value the raw value envelope to store
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	async setRaw<Value = GenericValue>(
		key: string,
		value: DeserializedData<Value>,
	): Promise<boolean> {
		const data = { key, value };
		await this.hookWithDeprecated(KeyvHooks.BEFORE_SET_RAW, data);

		const derivedTtl =
			typeof data.value.expires === "number"
				? data.value.expires - Date.now()
				: undefined;
		const ttl =
			typeof derivedTtl === "number" && derivedTtl > 0 ? derivedTtl : undefined;

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
			this.emit("error", error);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_SET_RAW, {
			key,
			value: data.value,
			ttl,
		});
		this.stats.set();

		return result;
	}

	/**
	 * Set many items to the store
	 * @param {Array<KeyvEntry<Value>>} entries the entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	async setMany<Value = GenericValue>(
		entries: KeyvEntry<Value>[],
	): Promise<boolean[]> {
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
						ttl ??= this._ttl;

						/* v8 ignore next -- @preserve */
						if (ttl === 0) {
							ttl = undefined;
						}

						/* v8 ignore next -- @preserve */
						const expires =
							typeof ttl === "number" ? Date.now() + ttl : undefined;

						/* v8 ignore next -- @preserve */
						if (typeof value === "symbol") {
							this.emit("error", "symbol cannot be serialized");
							throw new Error("symbol cannot be serialized");
						}

						const formattedValue = { value, expires };
						const serializedValue = await this.serializeData(formattedValue);
						return { key, value: serializedValue, ttl };
					}),
				);
				const storeResult = await this._store.setMany(serializedEntries);
				/* v8 ignore next -- @preserve */
				results = Array.isArray(storeResult)
					? (storeResult as boolean[])
					: entries.map(() => true);
			}
		} catch (error) {
			this.emit("error", error);

			results = entries.map(() => false);
		}

		return results;
	}

	/**
	 * Set many raw values to the store without wrapping or serialization. This is the write-side counterpart to getManyRaw().
	 * Each entry's value should be a DeserializedData object with { value, expires? }. If you need TTL-based expiration,
	 * set `expires` on each value directly. The store-level TTL is derived automatically from `value.expires`.
	 * @param {Array<{key: string, value: DeserializedData<Value>}>} entries the raw entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	async setManyRaw<Value = GenericValue>(
		entries: Array<{
			key: string;
			value: DeserializedData<Value>;
		}>,
	): Promise<boolean[]> {
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
						const derivedTtl =
							typeof value.expires === "number"
								? value.expires - Date.now()
								: undefined;
						const ttl =
							typeof derivedTtl === "number" && derivedTtl > 0
								? derivedTtl
								: undefined;
						const serializedValue = await this.serializeData(value);
						return { key, value: serializedValue, ttl };
					}),
				);
				const storeResult = await this._store.setMany(rawEntries);
				results = Array.isArray(storeResult)
					? (storeResult as boolean[])
					: entries.map(() => true);
			}
		} catch (error) {
			this.emit("error", error);

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
			this.emit("error", error);
		}

		await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
			key,
			value: result,
		});
		this.stats.delete();

		return result;
	}

	/**
	 * Delete many items from the store
	 * @param {string[]} keys the keys to be deleted
	 * @returns {boolean[]} array of booleans indicating success for each key
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		try {
			const store = this._store;
			await this.hookWithDeprecated(KeyvHooks.BEFORE_DELETE, { key: keys });
			if (store.deleteMany !== undefined) {
				const storeResult = await store.deleteMany(keys);
				// Support adapters that still return a single boolean
				const results = Array.isArray(storeResult)
					? storeResult
					: keys.map(() => storeResult);
				await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
					key: keys,
					value: results,
				});
				return results;
			}

			const promises = keys.map(async (key: string) => store.delete(key));

			const results = await Promise.all(promises);
			await this.hookWithDeprecated(KeyvHooks.AFTER_DELETE, {
				key: keys,
				value: results,
			});
			return results;
		} catch (error) {
			this.emit("error", error);

			return keys.map(() => false);
		}
	}

	/**
	 * Clear the store
	 * @returns {void}
	 */
	async clear(): Promise<void> {
		this.emit("clear");
		const store = this._store;

		try {
			await store.clear();
		} catch (error) {
			this.emit("error", error);
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

		const store = this._store;
		if (store.has !== undefined && !(store instanceof Map)) {
			return store.has(key);
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let rawData: any;

		try {
			rawData = await store.get(key);
		} catch (error) {
			this.emit("error", error);

			return false;
		}

		if (rawData) {
			// biome-ignore lint/suspicious/noExplicitAny: type format
			const data = (await this.deserializeData(rawData)) as any;
			/* v8 ignore next -- @preserve */
			if (data) {
				if (data.expires === undefined || data.expires === null) {
					return true;
				}

				return data.expires > Date.now();
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
		const store = this._store;
		if (store.hasMany !== undefined) {
			return store.hasMany(keys);
		}

		const results: boolean[] = [];
		for (const key of keys) {
			// eslint-disable-next-line no-await-in-loop
			results.push(await this.has(key));
		}

		return results;
	}

	/**
	 * Will disconnect the store. This is only available if the store has a disconnect method
	 * @returns {Promise<void>}
	 */
	async disconnect(): Promise<void> {
		const store = this._store;
		this.emit("disconnect");
		if (typeof store.disconnect === "function") {
			return store.disconnect();
		}
	}

	public async serializeData<T>(
		data: DeserializedData<T>,
	): Promise<string | DeserializedData<T>> {
		// Pipeline: serialize (optional) -> compress (optional)
		if (!this._serialization && !this._compression) {
			return data;
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let result: any = data;

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

	public async deserializeData<T>(
		data: string | DeserializedData<T>,
	): Promise<DeserializedData<T> | undefined> {
		if (data === undefined || data === null) {
			return undefined;
		}

		// Pipeline: decompress (optional) -> parse (optional)
		if (!this._serialization && !this._compression) {
			if (typeof data === "string") {
				return undefined;
			}

			return data as DeserializedData<T>;
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let result: any = data;

		if (this._compression?.decompress) {
			result = await this._compression.decompress(result);
		}

		if (this._serialization && typeof result === "string") {
			return await this._serialization.parse<DeserializedData<T>>(result);
		}

		// If compression was used without serialization, JSON was used as fallback
		if (typeof result === "string") {
			try {
				return JSON.parse(result) as DeserializedData<T>;
			} catch {
				return undefined;
			}
		}

		return result as DeserializedData<T>;
	}
}

export default Keyv;
