import { defaultDeserialize, defaultSerialize } from "@keyv/serialize";
import EventManager from "./event-manager.js";
import HooksManager from "./hooks-manager.js";
import StatsManager from "./stats-manager.js";

export type DeserializedData<Value> = {
	value?: Value;
	expires?: number | undefined;
};

export type CompressionAdapter = {
	// biome-ignore lint/suspicious/noExplicitAny: type format
	compress(value: any, options?: any): Promise<any>;
	// biome-ignore lint/suspicious/noExplicitAny: type format
	decompress(value: any, options?: any): Promise<any>;
	serialize<Value>(data: DeserializedData<Value>): Promise<string> | string;
	deserialize<Value>(
		data: string,
	):
		| Promise<DeserializedData<Value> | undefined>
		| DeserializedData<Value>
		| undefined;
};

export type Serialize = <Value>(
	data: DeserializedData<Value>,
) => Promise<string> | string;

export type Deserialize = <Value>(
	data: string,
) =>
	| Promise<DeserializedData<Value> | undefined>
	| DeserializedData<Value>
	| undefined;

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

export type KeyvStoreAdapter = {
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
	 * A custom serialization function.
	 * @default defaultSerialize using JSON.stringify
	 */
	serialize?: Serialize;
	/**
	 * A custom deserialization function.
	 * @default defaultDeserialize using JSON.parse
	 */
	deserialize?: Deserialize;
	/**
	 * The storage adapter instance to be used by Keyv.
	 * @default new Map() - in-memory store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	store?: KeyvStoreAdapter | Map<any, any> | any;
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
	compression?: CompressionAdapter | any;
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

type KeyvOptions_ = Omit<KeyvOptions, "store"> & {
	// biome-ignore lint/suspicious/noExplicitAny: type format
	store: KeyvStoreAdapter | (Map<any, any> & KeyvStoreAdapter);
};

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
	opts: KeyvOptions_;
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
	private _store: KeyvStoreAdapter | Map<any, any> | any = new Map();

	private _serialize: Serialize | undefined = defaultSerialize;
	private _deserialize: Deserialize | undefined = defaultDeserialize;

	private _compression: CompressionAdapter | undefined;

	private _useKeyPrefix = true;

	private _throwOnErrors = false;

	/**
	 * Keyv Constructor
	 * @param {KeyvStoreAdapter | KeyvOptions | Map<any, any>} store  to be provided or just the options
	 * @param {Omit<KeyvOptions, 'store'>} [options] if you provide the store you can then provide the Keyv Options
	 */
	constructor(
		// biome-ignore lint/suspicious/noExplicitAny: type format
		store?: KeyvStoreAdapter | KeyvOptions | Map<any, any>,
		options?: Omit<KeyvOptions, "store">,
	);
	/**
	 * Keyv Constructor
	 * @param {KeyvOptions} options to be provided
	 */
	constructor(options?: KeyvOptions);
	/**
	 * Keyv Constructor
	 * @param {KeyvStoreAdapter | KeyvOptions} store
	 * @param {Omit<KeyvOptions, 'store'>} [options] if you provide the store you can then provide the Keyv Options
	 */
	constructor(
		store?: KeyvStoreAdapter | KeyvOptions,
		options?: Omit<KeyvOptions, "store">,
	) {
		super();
		options ??= {};
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		store ??= {} as KeyvOptions;

		this.opts = {
			namespace: "keyv",
			serialize: defaultSerialize,
			deserialize: defaultDeserialize,
			emitErrors: true,
			// @ts-expect-error - Map is not a KeyvStoreAdapter
			store: new Map(),
			...options,
		};

		if (store && (store as KeyvStoreAdapter).get) {
			this.opts.store = store as KeyvStoreAdapter;
		} else {
			this.opts = {
				...this.opts,
				...store,
			};
		}

		this._store = this.opts.store ?? new Map();

		this._compression = this.opts.compression;

		// biome-ignore lint/style/noNonNullAssertion: need to fix
		this._serialize = this.opts.serialize!;
		// biome-ignore lint/style/noNonNullAssertion: need to fix
		this._deserialize = this.opts.deserialize!;

		/* v8 ignore next -- @preserve */
		if (this.opts.namespace) {
			this._namespace = this.opts.namespace;
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
				typeof this._store[Symbol.iterator] === "function" &&
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

		if (this.opts.stats) {
			this.stats.enabled = this.opts.stats;
		}

		if (this.opts.ttl) {
			this._ttl = this.opts.ttl;
		}

		if (this.opts.useKeyPrefix !== undefined) {
			this._useKeyPrefix = this.opts.useKeyPrefix;
		}

		if (this.opts.throwOnErrors !== undefined) {
			this._throwOnErrors = this.opts.throwOnErrors;
		}
	}

	/**
	 * Get the current store
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get store(): KeyvStoreAdapter | Map<any, any> | any {
		return this._store;
	}

	/**
	 * Set the current store. This will also set the namespace, event error handler, and generate the iterator. If the store is not valid it will throw an error.
	 * @param {KeyvStoreAdapter | Map<any, any> | any} store the store to set
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public set store(store: KeyvStoreAdapter | Map<any, any> | any) {
		if (this._isValidStorageAdapter(store)) {
			this._store = store;
			this.opts.store = store;

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
	 * @returns {CompressionAdapter} The current compression function
	 */
	public get compression(): CompressionAdapter | undefined {
		return this._compression;
	}

	/**
	 * Set the current compression function
	 * @param {CompressionAdapter} compress The compression function to set
	 */
	public set compression(compress: CompressionAdapter | undefined) {
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
		this.opts.namespace = namespace;
		this._store.namespace = namespace;
		/* v8 ignore next -- @preserve */
		if (this.opts.store) {
			this.opts.store.namespace = namespace;
		}
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
		this.opts.ttl = ttl;
		this._ttl = ttl;
	}

	/**
	 * Get the current serialize function.
	 * @returns {Serialize} The current serialize function.
	 */
	public get serialize(): Serialize | undefined {
		return this._serialize;
	}

	/**
	 * Set the current serialize function.
	 * @param {Serialize} serialize The serialize function to set.
	 */
	public set serialize(serialize: Serialize | undefined) {
		this.opts.serialize = serialize;
		this._serialize = serialize;
	}

	/**
	 * Get the current deserialize function.
	 * @returns {Deserialize} The current deserialize function.
	 */
	public get deserialize(): Deserialize | undefined {
		return this._deserialize;
	}

	/**
	 * Set the current deserialize function.
	 * @param {Deserialize} deserialize The deserialize function to set.
	 */
	public set deserialize(deserialize: Deserialize | undefined) {
		this.opts.deserialize = deserialize;
		this._deserialize = deserialize;
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
		this.opts.useKeyPrefix = value;
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
		this.opts.throwOnErrors = value;
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
					this.delete(key);
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
	_isValidStorageAdapter(store: KeyvStoreAdapter | any): boolean {
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
		const { store } = this.opts;
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
			typeof rawData === "string" || this.opts.compression
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
		const { store } = this.opts;
		const keyPrefixed = this._getKeyPrefixArray(keys);

		const isDataExpired = (data: DeserializedData<Value>): boolean =>
			typeof data.expires === "number" && Date.now() > data.expires;

		this.hooks.trigger(KeyvHooks.PRE_GET_MANY, { keys: keyPrefixed });
		if (store.getMany === undefined) {
			const promises = keyPrefixed.map(async (key) => {
				const rawData = await store.get<Value>(key);
				const deserializedRow =
					typeof rawData === "string" || this.opts.compression
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
		const { store } = this.opts;
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
			typeof rawData === "string" || this.opts.compression
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
		const { store } = this.opts;
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

		const { store } = this.opts;

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
				results = await this._store.setMany(serializedEntries);
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
	 * Delete an Entry
	 * @param {string | string[]} key the key to be deleted. if an array it will delete many items
	 * @returns {boolean} will return true if item or items are deleted. false if there is an error
	 */
	public async delete(key: string | string[]): Promise<boolean> {
		const { store } = this.opts;
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
			const { store } = this.opts;
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
		const { store } = this.opts;

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
		const { store } = this.opts;
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
		const { store } = this.opts;
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
		const { store } = this.opts;
		this.emit("disconnect");
		if (typeof store.disconnect === "function") {
			return store.disconnect();
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	public emit(event: string, ...arguments_: any[]): void {
		if (event === "error" && !this.opts.emitErrors) {
			return;
		}

		super.emit(event, ...arguments_);
	}

	public async serializeData<T>(
		data: DeserializedData<T>,
	): Promise<string | DeserializedData<T>> {
		if (!this._serialize) {
			return data;
		}

		if (this._compression?.compress) {
			return this._serialize({
				value: await this._compression.compress(data.value),
				expires: data.expires,
			});
		}

		return this._serialize(data);
	}

	public async deserializeData<T>(
		data: string | DeserializedData<T>,
	): Promise<DeserializedData<T> | undefined> {
		if (!this._deserialize) {
			return data as DeserializedData<T>;
		}

		if (this._compression?.decompress && typeof data === "string") {
			const result = await this._deserialize(data);
			return {
				value: await this._compression.decompress(result?.value),
				expires: result?.expires,
			};
		}

		if (typeof data === "string") {
			return this._deserialize(data);
		}

		return undefined;
	}
}

export default Keyv;
