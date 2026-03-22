import { KeyvJsonSerializer } from "@keyv/serialize";
import EventManager from "./event-manager.js";
import HooksManager from "./hooks-manager.js";
import StatsManager from "./stats-manager.js";
import {
	type DeserializedData,
	type KeyvCompressionAdapter,
	type KeyvEntry,
	KeyvHooks,
	type KeyvOptions,
	type KeyvSerializationAdapter,
	type KeyvStorageAdapter,
	type StoredDataNoRaw,
	type StoredDataRaw,
} from "./types.js";

export type {
	DeserializedData,
	IEventEmitter,
	KeyvCompressionAdapter,
	KeyvEntry,
	KeyvOptions,
	KeyvSerializationAdapter,
	KeyvStorageAdapter,
	StoredData,
	StoredDataNoRaw,
	StoredDataRaw,
} from "./types.js";
export { KeyvHooks } from "./types.js";

/**
 * @deprecated Use `KeyvStorageAdapter` instead.
 */
export type KeyvStoreAdapter = KeyvStorageAdapter;

// biome-ignore lint/suspicious/noExplicitAny: type format
type IteratorFunction = (argument: any) => AsyncGenerator<any, void>;

const iterableAdapters = [
	"sqlite",
	"postgres",
	"mysql",
	"mongo",
	"redis",
	"valkey",
	"etcd",
];

// biome-ignore lint/suspicious/noExplicitAny: type format
export class Keyv<GenericValue = any> extends EventManager {
	iterator?: IteratorFunction;
	hooks = new HooksManager();
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

	private _useKeyPrefix = true;

	private _throwOnErrors = false;

	private _emitErrors = true;

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
		super();
		options ??= {};
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		store ??= {} as KeyvOptions;

		const mergedOptions: KeyvOptions = {
			namespace: "keyv",
			emitErrors: true,
			...options,
		};

		if (store && (store as KeyvStorageAdapter).get) {
			mergedOptions.store = store as KeyvStorageAdapter;
		} else {
			Object.assign(mergedOptions, store);
		}

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
			} else if (
				"iterator" in this._store &&
				this._store.opts &&
				this._checkIterableAdapter()
			) {
				this.iterator = this.generateIterator(
					// biome-ignore lint/style/noNonNullAssertion: need to fix
					this._store.iterator!.bind(this._store),
				);
			}
		}

		if (mergedOptions.stats) {
			this.stats.enabled = mergedOptions.stats;
		}

		if (mergedOptions.ttl) {
			this._ttl = mergedOptions.ttl;
		}

		if (mergedOptions.useKeyPrefix !== undefined) {
			this._useKeyPrefix = mergedOptions.useKeyPrefix;
		}

		if (mergedOptions.emitErrors !== undefined) {
			this._emitErrors = mergedOptions.emitErrors;
		}

		if (mergedOptions.throwOnErrors !== undefined) {
			this._throwOnErrors = mergedOptions.throwOnErrors;
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
			} else if (
				"iterator" in store &&
				store.opts &&
				this._checkIterableAdapter()
			) {
				this.iterator = this.generateIterator(store.iterator?.bind(store));
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
	 * Get the current useKeyPrefix value. This will enable or disable key prefixing.
	 * @returns {boolean} The current useKeyPrefix value.
	 * @default true
	 */
	public get useKeyPrefix(): boolean {
		return this._useKeyPrefix;
	}

	/**
	 * Set the current useKeyPrefix value. This will enable or disable key prefixing.
	 * @param {boolean} value The useKeyPrefix value to set.
	 */
	public set useKeyPrefix(value: boolean) {
		this._useKeyPrefix = value;
	}

	/**
	 * Get the current throwErrors value. This will enable or disable throwing errors on methods in addition to emitting them.
	 * @return {boolean} The current throwOnErrors value.
	 */
	public get throwOnErrors(): boolean {
		return this._throwOnErrors;
	}

	/**
	 * Set the current throwOnErrors value. This will enable or disable throwing errors on methods in addition to emitting them.
	 * @param {boolean} value The throwOnErrors value to set.
	 */
	public set throwOnErrors(value: boolean) {
		this._throwOnErrors = value;
	}

	/**
	 * Get the current emitErrors value. This will enable or disable emitting errors on methods.
	 * @return {boolean} The current emitErrors value.
	 * @default true
	 */
	public get emitErrors(): boolean {
		return this._emitErrors;
	}

	/**
	 * Set the current emitErrors value. This will enable or disable emitting errors on methods.
	 * @param {boolean} value The emitErrors value to set.
	 */
	public set emitErrors(value: boolean) {
		this._emitErrors = value;
	}

	generateIterator(iterator: IteratorFunction): IteratorFunction {
		// biome-ignore lint/suspicious/noExplicitAny: type format
		const function_: IteratorFunction = async function* (this: any) {
			for await (const [key, raw] of typeof iterator === "function"
				? iterator(this._store.namespace)
				: iterator) {
				const data = await this.deserializeData(raw);
				if (
					this._useKeyPrefix &&
					this._store.namespace &&
					!key.includes(this._store.namespace)
				) {
					continue;
				}

				if (typeof data.expires === "number" && Date.now() > data.expires) {
					await this.delete(key);
					continue;
				}

				yield [this._getKeyUnprefix(key), data.value];
			}
		};

		return function_.bind(this);
	}

	_checkIterableAdapter(): boolean {
		return (
			iterableAdapters.includes(this._store.opts.dialect as string) ||
			iterableAdapters.some((element) =>
				(this._store.opts.url as string).includes(element),
			)
		);
	}

	_getKeyPrefix(key: string): string {
		if (!this._useKeyPrefix) {
			return key;
		}

		if (!this._namespace) {
			return key;
		}

		// If the key is already prefixed, return it
		if (key.startsWith(`${this._namespace}:`)) {
			return key;
		}

		return `${this._namespace}:${key}`;
	}

	_getKeyPrefixArray(keys: string[]): string[] {
		if (!this._useKeyPrefix) {
			return keys;
		}

		if (!this._namespace) {
			return keys;
		}

		return keys.map((key) => `${this._namespace}:${key}`);
	}

	_getKeyUnprefix(key: string): string {
		if (!this._useKeyPrefix) {
			return key;
		}

		return key.split(":").splice(1).join(":");
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
	 * @param {{raw: boolean} | undefined} options can pass in to return the raw value by setting { raw: true }
	 */
	async get<Value = GenericValue>(
		key: string,
		options?: { raw: false },
	): Promise<StoredDataNoRaw<Value>>;
	async get<Value = GenericValue>(
		key: string,
		options?: { raw: true },
	): Promise<StoredDataRaw<Value>>;
	async get<Value = GenericValue>(
		key: string[],
		options?: { raw: false },
	): Promise<Array<StoredDataNoRaw<Value>>>;
	async get<Value = GenericValue>(
		key: string[],
		options?: { raw: true },
	): Promise<Array<StoredDataRaw<Value>>>;
	// eslint-disable-next-line @stylistic/max-len
	async get<Value = GenericValue>(
		key: string | string[],
		options?: { raw: boolean },
	): Promise<
		| StoredDataNoRaw<Value>
		| Array<StoredDataNoRaw<Value>>
		| StoredDataRaw<Value>
		| Array<StoredDataRaw<Value>>
	> {
		const store = this._store;
		const isArray = Array.isArray(key);
		const keyPrefixed = isArray
			? this._getKeyPrefixArray(key)
			: this._getKeyPrefix(key);

		const isDataExpired = (data: DeserializedData<Value>): boolean =>
			typeof data.expires === "number" && Date.now() > data.expires;

		if (isArray) {
			if (options?.raw === true) {
				return this.getMany<Value>(key, { raw: true });
			}

			return this.getMany<Value>(key, { raw: false });
		}

		this.hooks.trigger(KeyvHooks.PRE_GET, { key: keyPrefixed });
		// biome-ignore lint/suspicious/noImplicitAnyLet: need to fix
		let rawData;
		try {
			rawData = await store.get<Value>(keyPrefixed as string);
		} catch (error) {
			if (this.throwOnErrors) {
				throw error;
			}
		}

		const deserializedData =
			typeof rawData === "string" || this._compression
				? await this.deserializeData<Value>(rawData as string)
				: rawData;

		if (deserializedData === undefined || deserializedData === null) {
			this.hooks.trigger(KeyvHooks.POST_GET, {
				key: keyPrefixed,
				value: undefined,
			});
			this.stats.miss();
			return undefined;
		}

		if (isDataExpired(deserializedData as DeserializedData<Value>)) {
			await this.delete(key);
			this.hooks.trigger(KeyvHooks.POST_GET, {
				key: keyPrefixed,
				value: undefined,
			});
			this.stats.miss();
			return undefined;
		}

		this.hooks.trigger(KeyvHooks.POST_GET, {
			key: keyPrefixed,
			value: deserializedData,
		});
		this.stats.hit();
		return options?.raw
			? deserializedData
			: (deserializedData as DeserializedData<Value>).value;
	}

	/**
	 * Get many values of keys
	 * @param {string[]} keys passing in a single key or multiple as an array
	 * @param {{raw: boolean} | undefined} options can pass in to return the raw value by setting { raw: true }
	 */
	public async getMany<Value = GenericValue>(
		keys: string[],
		options?: { raw: false },
	): Promise<Array<StoredDataNoRaw<Value>>>;
	public async getMany<Value = GenericValue>(
		keys: string[],
		options?: { raw: true },
	): Promise<Array<StoredDataRaw<Value>>>;
	public async getMany<Value = GenericValue>(
		keys: string[],
		options?: { raw: boolean },
	): Promise<Array<StoredDataNoRaw<Value>> | Array<StoredDataRaw<Value>>> {
		const store = this._store;
		const keyPrefixed = this._getKeyPrefixArray(keys);

		const isDataExpired = (data: DeserializedData<Value>): boolean =>
			typeof data.expires === "number" && Date.now() > data.expires;

		this.hooks.trigger(KeyvHooks.PRE_GET_MANY, { keys: keyPrefixed });
		if (store.getMany === undefined) {
			const promises = keyPrefixed.map(async (key) => {
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

				return options?.raw
					? (deserializedRow as StoredDataRaw<Value>)
					: ((deserializedRow as DeserializedData<Value>)
							.value as StoredDataNoRaw<Value>);
			});

			const deserializedRows = await Promise.allSettled(promises);
			const result = deserializedRows.map(
				// biome-ignore lint/suspicious/noExplicitAny: type format
				(row) => (row as PromiseFulfilledResult<any>).value,
			);
			this.hooks.trigger(KeyvHooks.POST_GET_MANY, result);
			if (result.length > 0) {
				this.stats.hit();
			}

			return result;
		}

		const rawData = await store.getMany<Value>(keyPrefixed);

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

			const value = options?.raw
				? (row as StoredDataRaw<Value>)
				: ((row as DeserializedData<Value>).value as StoredDataNoRaw<Value>);
			result.push(value);
		}

		if (expiredKeys.length > 0) {
			await this.deleteMany(expiredKeys);
		}

		this.hooks.trigger(KeyvHooks.POST_GET_MANY, result);
		/* v8 ignore next -- @preserve */
		if (result.length > 0) {
			this.stats.hit();
		}

		return result as
			| Array<StoredDataNoRaw<Value>>
			| Array<StoredDataRaw<Value>>;
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
		const keyPrefixed = this._getKeyPrefix(key);

		this.hooks.trigger(KeyvHooks.PRE_GET_RAW, { key: keyPrefixed });
		const rawData = await store.get(keyPrefixed);

		if (rawData === undefined || rawData === null) {
			this.hooks.trigger(KeyvHooks.POST_GET_RAW, {
				key: keyPrefixed,
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
			this.hooks.trigger(KeyvHooks.POST_GET_RAW, {
				key: keyPrefixed,
				value: undefined,
			});
			this.stats.miss();
			await this.delete(key);
			return undefined;
		}

		// Add a hit
		this.stats.hit();

		this.hooks.trigger(KeyvHooks.POST_GET_RAW, {
			key: keyPrefixed,
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
		const keyPrefixed = this._getKeyPrefixArray(keys);

		if (keys.length === 0) {
			const result = Array.from({ length: keys.length }).fill(
				undefined,
			) as Array<StoredDataRaw<Value>>;
			// Add in misses
			this.stats.misses += keys.length;
			// Trigger the post get many raw hook
			this.hooks.trigger(KeyvHooks.POST_GET_MANY_RAW, {
				keys: keyPrefixed,
				values: result,
			});
			return result;
		}

		let result: Array<StoredDataRaw<Value>> = [];
		// Check to see if the store has a getMany method
		if (store.getMany === undefined) {
			// If not then we will get each key individually
			const promises = keyPrefixed.map(async (key) => {
				const rawData = await store.get<Value>(key);
				if (rawData !== undefined && rawData !== null) {
					return this.deserializeData<Value>(rawData as string);
				}

				return undefined;
			});

			const deserializedRows = await Promise.allSettled(promises);
			result = deserializedRows.map(
				// biome-ignore lint/suspicious/noExplicitAny: type format
				(row) => (row as PromiseFulfilledResult<any>).value,
			);
		} else {
			const rawData = await store.getMany(keyPrefixed);

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
				expiredKeys.push(keyPrefixed[index]);
				result[index] = undefined;
			}
		}

		if (expiredKeys.length > 0) {
			await this.deleteMany(expiredKeys);
		}

		// Add in hits and misses
		this.stats.hitsOrMisses(result);
		// Trigger the post get many raw hook
		this.hooks.trigger(KeyvHooks.POST_GET_MANY_RAW, {
			keys: keyPrefixed,
			values: result,
		});
		return result;
	}

	/**
	 * Set an item to the store
	 * @param {string | Array<KeyvEntry>} key the key to use. If you pass in an array of KeyvEntry it will set many items
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
		this.hooks.trigger(KeyvHooks.PRE_SET, data);
		const keyPrefixed = this._getKeyPrefix(data.key);

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
			const value = await store.set(keyPrefixed, serializedValue, data.ttl);

			if (typeof value === "boolean") {
				result = value;
			}
		} catch (error) {
			result = false;
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}

		this.hooks.trigger(KeyvHooks.POST_SET, {
			key: keyPrefixed,
			value: serializedValue,
			ttl,
		});
		this.stats.set();

		return result;
	}

	/**
	 * Set a raw value to the store without wrapping or serialization. This is the write-side counterpart to getRaw().
	 * The value should be a DeserializedData object with { value, expires? }.
	 * @param {string} key the key to set
	 * @param {DeserializedData<Value>} value the raw value envelope to store
	 * @param {number} [ttl] time to live in milliseconds. If the raw value does not already have an expires field, it will be computed from ttl.
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	async setRaw<Value = GenericValue>(
		key: string,
		value: DeserializedData<Value>,
		ttl?: number,
	): Promise<boolean> {
		const data = { key, value, ttl };
		this.hooks.trigger(KeyvHooks.PRE_SET_RAW, data);
		const keyPrefixed = this._getKeyPrefix(data.key);

		data.ttl ??= this._ttl;

		if (data.ttl === 0) {
			data.ttl = undefined;
		}

		if (data.value.expires === undefined && typeof data.ttl === "number") {
			data.value.expires = Date.now() + data.ttl;
		}

		const store = this._store;
		let result = true;

		try {
			const serializedValue = await this.serializeData(data.value);
			const storeResult = await store.set(
				keyPrefixed,
				serializedValue,
				data.ttl,
			);

			if (typeof storeResult === "boolean") {
				result = storeResult;
			}
		} catch (error) {
			result = false;
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}

		this.hooks.trigger(KeyvHooks.POST_SET_RAW, {
			key: keyPrefixed,
			value: data.value,
			ttl: data.ttl,
		});
		this.stats.set();

		return result;
	}

	/**
	 * Set many items to the store
	 * @param {Array<KeyvEntry>} entries the entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	// biome-ignore lint/correctness/noUnusedVariables: type format
	async setMany<Value = GenericValue>(
		entries: KeyvEntry[],
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
						const keyPrefixed = this._getKeyPrefix(key);
						return { key: keyPrefixed, value: serializedValue, ttl };
					}),
				);
				const storeResult = await this._store.setMany(serializedEntries);
				results = Array.isArray(storeResult)
					? (storeResult as boolean[])
					: entries.map(() => true);
			}
		} catch (error) {
			this.emit("error", error);

			if (this._throwOnErrors) {
				throw error;
			}

			results = entries.map(() => false);
		}

		return results;
	}

	/**
	 * Set many raw values to the store without wrapping or serialization. This is the write-side counterpart to getManyRaw().
	 * Each entry's value should be a DeserializedData object with { value, expires? }.
	 * @param {Array<{key: string, value: DeserializedData<Value>, ttl?: number}>} entries the raw entries to set
	 * @returns {boolean[]} will return an array of booleans if it sets then it will return a true. On failure will return false.
	 */
	async setManyRaw<Value = GenericValue>(
		entries: Array<{
			key: string;
			value: DeserializedData<Value>;
			ttl?: number;
		}>,
	): Promise<boolean[]> {
		let results: boolean[] = [];

		this.hooks.trigger(KeyvHooks.PRE_SET_MANY_RAW, { entries });

		try {
			if (this._store.setMany === undefined) {
				const promises: Array<Promise<boolean>> = [];
				for (const entry of entries) {
					promises.push(this.setRaw(entry.key, entry.value, entry.ttl));
				}

				results = await Promise.all(promises);
			} else {
				const rawEntries = await Promise.all(
					entries.map(async ({ key, value, ttl }) => {
						ttl ??= this._ttl;

						/* v8 ignore next -- @preserve */
						if (ttl === 0) {
							ttl = undefined;
						}

						if (value.expires === undefined && typeof ttl === "number") {
							value.expires = Date.now() + ttl;
						}

						const serializedValue = await this.serializeData(value);
						const keyPrefixed = this._getKeyPrefix(key);
						return { key: keyPrefixed, value: serializedValue, ttl };
					}),
				);
				const storeResult = await this._store.setMany(rawEntries);
				results = Array.isArray(storeResult)
					? (storeResult as boolean[])
					: entries.map(() => true);
			}
		} catch (error) {
			this.emit("error", error);

			if (this._throwOnErrors) {
				throw error;
			}

			results = entries.map(() => false);
		}

		this.hooks.trigger(KeyvHooks.POST_SET_MANY_RAW, { entries, results });

		return results;
	}

	/**
	 * Delete an Entry
	 * @param {string | string[]} key the key to be deleted. if an array it will delete many items
	 * @returns {boolean} will return true if item or items are deleted. false if there is an error
	 */
	public async delete(key: string | string[]): Promise<boolean> {
		const store = this._store;
		if (Array.isArray(key)) {
			return this.deleteMany(key);
		}

		const keyPrefixed = this._getKeyPrefix(key);
		this.hooks.trigger(KeyvHooks.PRE_DELETE, { key: keyPrefixed });

		let result = true;

		try {
			const value = await store.delete(keyPrefixed);

			/* v8 ignore next -- @preserve */
			if (typeof value === "boolean") {
				result = value;
			}
		} catch (error) {
			result = false;
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}
		}

		this.hooks.trigger(KeyvHooks.POST_DELETE, {
			key: keyPrefixed,
			value: result,
		});
		this.stats.delete();

		return result;
	}

	/**
	 * Delete many items from the store
	 * @param {string[]} keys the keys to be deleted
	 * @returns {boolean} will return true if item or items are deleted. false if there is an error
	 */
	public async deleteMany(keys: string[]): Promise<boolean> {
		try {
			const store = this._store;
			const keyPrefixed = this._getKeyPrefixArray(keys);
			this.hooks.trigger(KeyvHooks.PRE_DELETE, { key: keyPrefixed });
			if (store.deleteMany !== undefined) {
				return await store.deleteMany(keyPrefixed);
			}

			const promises = keyPrefixed.map(async (key) => store.delete(key));

			const results = await Promise.all(promises);
			const returnResult = results.every(Boolean);
			this.hooks.trigger(KeyvHooks.POST_DELETE, {
				key: keyPrefixed,
				value: returnResult,
			});
			return returnResult;
		} catch (error) {
			this.emit("error", error);

			if (this._throwOnErrors) {
				throw error;
			}

			return false;
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
			if (this._throwOnErrors) {
				throw error;
			}
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

		const keyPrefixed = this._getKeyPrefix(key);
		const store = this._store;
		if (store.has !== undefined && !(store instanceof Map)) {
			return store.has(keyPrefixed);
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		let rawData: any;

		try {
			rawData = await store.get(keyPrefixed);
		} catch (error) {
			this.emit("error", error);
			if (this._throwOnErrors) {
				throw error;
			}

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
		const keyPrefixed = this._getKeyPrefixArray(keys);
		const store = this._store;
		if (store.hasMany !== undefined) {
			return store.hasMany(keyPrefixed);
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

	// biome-ignore lint/suspicious/noExplicitAny: type format
	public emit(event: string, ...arguments_: any[]): void {
		if (event === "error" && !this._emitErrors) {
			return;
		}

		super.emit(event, ...arguments_);
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
			return this._serialization.parse<DeserializedData<T>>(result);
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
