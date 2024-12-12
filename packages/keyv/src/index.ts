import {defaultSerialize, defaultDeserialize} from '@keyv/serialize';
import HooksManager from './hooks-manager.js';
import EventManager from './event-manager.js';
import StatsManager from './stats-manager.js';

export type DeserializedData<Value> = {
	value?: Value;
	// eslint-disable-next-line @typescript-eslint/ban-types
	expires?: number | null;
};

export interface CompressionAdapter {
	compress(value: any, options?: any): Promise<any>;
	decompress(value: any, options?: any): Promise<any>;
	serialize<Value>(data: DeserializedData<Value>): Promise<string> | string;
	deserialize<Value>(data: string): Promise<DeserializedData<Value> | undefined> | DeserializedData<Value> | undefined;
}

export type Serialize = <Value>(data: DeserializedData<Value>) => Promise<string> | string;

export type Deserialize = <Value>(data: string) => Promise<DeserializedData<Value> | undefined> | DeserializedData<Value> | undefined;

export enum KeyvHooks {
	PRE_SET = 'preSet',
	POST_SET = 'postSet',
	PRE_GET = 'preGet',
	POST_GET = 'postGet',
	PRE_GET_MANY = 'preGetMany',
	POST_GET_MANY = 'postGetMany',
	PRE_DELETE = 'preDelete',
	POST_DELETE = 'postDelete',
}

export type StoredDataNoRaw<Value> = Value | undefined;

export type StoredDataRaw<Value> = DeserializedData<Value> | undefined;

export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

export interface IEventEmitter {
	on(event: string, listener: (...arguments_: any[]) => void): this;
}

export interface KeyvStoreAdapter extends IEventEmitter {
	opts: any;
	namespace?: string;
	get<Value>(key: string): Promise<StoredData<Value> | undefined>;
	set(key: string, value: any, ttl?: number): any;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has?(key: string): Promise<boolean>;
	getMany?<Value>(
		keys: string[]
	): Promise<Array<StoredData<Value | undefined>>>;
	disconnect?(): Promise<void>;
	deleteMany?(key: string[]): Promise<boolean>;
	iterator?<Value>(namespace?: string): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
}

export type KeyvOptions = {
	/** Emit errors */
	emitErrors?: boolean;
	/** Namespace for the current instance. */
	namespace?: string;
	/** A custom serialization function. */
	serialize?: Serialize;
	/** A custom deserialization function. */
	deserialize?: Deserialize;
	/** The storage adapter instance to be used by Keyv. */
	store?: KeyvStoreAdapter | Map<any, any> | any;
	/** Default TTL. Can be overridden by specifying a TTL on `.set()`. */
	ttl?: number;
	/** Enable compression option **/
	compression?: CompressionAdapter | any;
	/** Enable or disable statistics (default is false) */
	stats?: boolean;
	/** Enable or disable key prefixing (default is true) */
	useKeyPrefix?: boolean;
};

type KeyvOptions_ = Omit<KeyvOptions, 'store'> & {store: KeyvStoreAdapter | Map<any, any> & KeyvStoreAdapter};

type IteratorFunction = (argument: any) => AsyncGenerator<any, void>;

const iterableAdapters = [
	'sqlite',
	'postgres',
	'mysql',
	'mongo',
	'redis',
	'valkey',
	'etcd',
];

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
	private _store: KeyvStoreAdapter | Map<any, any> | any = new Map();

	private _serialize: Serialize | undefined = defaultSerialize;
	private _deserialize: Deserialize | undefined = defaultDeserialize;

	private _compression: CompressionAdapter | undefined;

	private _useKeyPrefix = true;

	/**
	 * Keyv Constructor
	 * @param {KeyvStoreAdapter | KeyvOptions | Map<any, any>} store  to be provided or just the options
	 * @param {Omit<KeyvOptions, 'store'>} [options] if you provide the store you can then provide the Keyv Options
	 */
	constructor(store?: KeyvStoreAdapter | KeyvOptions | Map<any, any>, options?: Omit<KeyvOptions, 'store'>);
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
	constructor(store?: KeyvStoreAdapter | KeyvOptions, options?: Omit<KeyvOptions, 'store'>) {
		super();
		options ??= {};
		store ??= {} as KeyvOptions;

		this.opts = {
			namespace: 'keyv',
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

		this._store = this.opts.store;

		this._compression = this.opts.compression;

		this._serialize = this.opts.serialize!;
		this._deserialize = this.opts.deserialize!;

		if (this.opts.namespace) {
			this._namespace = this.opts.namespace;
		}

		if (this._store) {
			if (!this._isValidStorageAdapter(this._store)) {
				throw new Error('Invalid storage adapter');
			}

			if (typeof this._store.on === 'function') {
				this._store.on('error', (error: any) => this.emit('error', error));
			}

			this._store.namespace = this._namespace;

			// Attach iterators
			// @ts-ignore
			if (typeof this._store[Symbol.iterator] === 'function' && this._store instanceof Map) {
				this.iterator = this.generateIterator((this._store as unknown as IteratorFunction));
			} else if ('iterator' in this._store && this._store.opts && this._checkIterableAdapter()) {
				this.iterator = this.generateIterator(this._store.iterator!.bind(this._store));
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
	}

	/**
	 * Get the current store
	 */
	public get store(): KeyvStoreAdapter | Map<any, any> | any {
		return this._store;
	}

	/**
	 * Set the current store. This will also set the namespace, event error handler, and generate the iterator. If the store is not valid it will throw an error.
	 * @param {KeyvStoreAdapter | Map<any, any> | any} store the store to set
	 */
	public set store(store: KeyvStoreAdapter | Map<any, any> | any) {
		if (this._isValidStorageAdapter(store)) {
			this._store = store;
			this.opts.store = store;

			if (typeof store.on === 'function') {
				store.on('error', (error: any) => this.emit('error', error));
			}

			if (this._namespace) {
				this._store.namespace = this._namespace;
			}

			if (typeof store[Symbol.iterator] === 'function' && store instanceof Map) {
				this.iterator = this.generateIterator((store as unknown as IteratorFunction));
			} else if ('iterator' in store && store.opts && this._checkIterableAdapter()) {
				this.iterator = this.generateIterator(store.iterator!.bind(store));
			}
		} else {
			throw new Error('Invalid storage adapter');
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
		if (this.opts.store) {
			this.opts.store.namespace = namespace;
		}
	}

	/**
	 * Get the current TTL.
	 * @returns {number} The current TTL.
	 */
	public get ttl(): number | undefined {
		return this._ttl;
	}

	/**
	 * Set the current TTL.
	 * @param {number} ttl The TTL to set.
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

	generateIterator(iterator: IteratorFunction): IteratorFunction {
		const function_: IteratorFunction = async function * (this: any) {
			for await (const [key, raw] of (typeof iterator === 'function'
				? iterator(this._store.namespace)
				: iterator)) {
				const data = await this.deserializeData(raw);
				if (this._useKeyPrefix && this._store.namespace && !key.includes(this._store.namespace)) {
					continue;
				}

				if (typeof data.expires === 'number' && Date.now() > data.expires) {
					this.delete(key);
					continue;
				}

				yield [this._getKeyUnprefix(key), data.value];
			}
		};

		return function_.bind(this);
	}

	_checkIterableAdapter(): boolean {
		return iterableAdapters.includes((this._store.opts.dialect as string))
			|| iterableAdapters.some(element => (this._store.opts.url as string).includes(element));
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

		return keys.map(key => `${this._namespace}:${key}`);
	}

	_getKeyUnprefix(key: string): string {
		if (!this._useKeyPrefix) {
			return key;
		}

		return key
			.split(':')
			.splice(1)
			.join(':');
	}

	_isValidStorageAdapter(store: KeyvStoreAdapter | any): boolean {
		return (
			store instanceof Map || (
				typeof store.get === 'function'
				&& typeof store.set === 'function'
				&& typeof store.delete === 'function'
				&& typeof store.clear === 'function'
			)
		);
	}

	/**
	 * Get the Value of a Key
	 * @param {string | string[]} key passing in a single key or multiple as an array
	 * @param [options] can pass in to return the raw value by setting { raw: true }
	 */
	async get<Value = GenericValue>(key: string, options?: {raw: false}): Promise<StoredDataNoRaw<Value>>;
	async get<Value = GenericValue>(key: string, options?: {raw: true}): Promise<StoredDataRaw<Value>>;
	async get<Value = GenericValue>(key: string[], options?: {raw: false}): Promise<Array<StoredDataNoRaw<Value>>>;
	async get<Value = GenericValue>(key: string[], options?: {raw: true}): Promise<Array<StoredDataRaw<Value>>>;
	async get<Value = GenericValue>(key: string | string[], options?: {raw: boolean}): Promise<StoredDataNoRaw<Value> | Array<StoredDataNoRaw<Value>> | StoredDataRaw<Value> | Array<StoredDataRaw<Value>>> {
		const {store} = this.opts;
		const isArray = Array.isArray(key);
		const keyPrefixed = isArray ? this._getKeyPrefixArray(key) : this._getKeyPrefix(key);

		const isDataExpired = (data: DeserializedData<Value>): boolean => typeof data.expires === 'number' && Date.now() > data.expires;

		if (isArray) {
			this.hooks.trigger(KeyvHooks.PRE_GET_MANY, {keys: keyPrefixed});
			if (store.getMany === undefined) {
				const promises = (keyPrefixed as string[]).map(async key => {
					const rawData = await store.get<Value>(key);
					const deserializedRow = (typeof rawData === 'string' || this.opts.compression) ? await this.deserializeData<Value>(rawData as string) : rawData;

					if (deserializedRow === undefined || deserializedRow === null) {
						return undefined;
					}

					if (isDataExpired(deserializedRow as DeserializedData<Value>)) {
						await this.delete(key);
						return undefined;
					}

					return (options?.raw) ? deserializedRow as StoredDataRaw<Value> : (deserializedRow as DeserializedData<Value>).value as StoredDataNoRaw<Value>;
				});

				const deserializedRows = await Promise.allSettled(promises);
				const result = deserializedRows.map(row => (row as PromiseFulfilledResult<any>).value);
				this.hooks.trigger(KeyvHooks.POST_GET_MANY, result);
				if (result.length > 0) {
					this.stats.hit();
				}

				return result;
			}

			const rawData = await store.getMany<Value>(keyPrefixed as string[]);

			const result = [];
			for (const index in rawData) {
				let row = rawData[index];

				if ((typeof row === 'string')) {
					row = await this.deserializeData<Value>(row);
				}

				if (row === undefined || row === null) {
					result.push(undefined);
					continue;
				}

				if (isDataExpired(row as DeserializedData<Value>)) {
					await this.delete(key[index]);
					result.push(undefined);
					continue;
				}

				const value = (options?.raw) ? row as StoredDataRaw<Value> : (row as DeserializedData<Value>).value as StoredDataNoRaw<Value>;
				result.push(value);
			}

			this.hooks.trigger(KeyvHooks.POST_GET_MANY, result);
			if (result.length > 0) {
				this.stats.hit();
			}

			return result as (Array<StoredDataNoRaw<Value>> | Array<StoredDataRaw<Value>>);
		}

		this.hooks.trigger(KeyvHooks.PRE_GET, {key: keyPrefixed});
		const rawData = await store.get<Value>(keyPrefixed as string);
		const deserializedData = (typeof rawData === 'string' || this.opts.compression) ? await this.deserializeData<Value>(rawData as string) : rawData;

		if (deserializedData === undefined || deserializedData === null) {
			this.stats.miss();
			return undefined;
		}

		if (isDataExpired(deserializedData as DeserializedData<Value>)) {
			await this.delete(key);
			this.stats.miss();
			return undefined;
		}

		this.hooks.trigger(KeyvHooks.POST_GET, {key: keyPrefixed, value: deserializedData});
		this.stats.hit();
		return (options?.raw) ? deserializedData : (deserializedData as DeserializedData<Value>).value;
	}

	/**
	 * Set an item to the store
	 * @param {string} key the key to use
	 * @param {Value} value the value of the key
	 * @param {number} [ttl] time to live in milliseconds
	 * @returns {boolean} if it sets then it will return a true. On failure will return false.
	 */
	async set<Value = GenericValue>(key: string, value: Value, ttl?: number): Promise<boolean> {
		this.hooks.trigger(KeyvHooks.PRE_SET, {key, value, ttl});
		const keyPrefixed = this._getKeyPrefix(key);
		if (typeof ttl === 'undefined') {
			ttl = this._ttl;
		}

		if (ttl === 0) {
			ttl = undefined;
		}

		const {store} = this.opts;

		const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;

		if (typeof value === 'symbol') {
			this.emit('error', 'symbol cannot be serialized');
		}

		const formattedValue = {value, expires};
		const serializedValue = await this.serializeData(formattedValue);

		let result = true;

		try {
			const value = await store.set(keyPrefixed, serializedValue, ttl);

			if (typeof value === 'boolean') {
				result = value;
			}
		} catch (error) {
			result = false;
			this.emit('error', error);
		}

		this.hooks.trigger(KeyvHooks.POST_SET, {key: keyPrefixed, value: serializedValue, ttl});
		this.stats.set();

		return result;
	}

	/**
	 * Delete an Entry
	 * @param {string | string[]} key the key to be deleted. if an array it will delete many items
	 * @returns {boolean} will return true if item or items are deleted. false if there is an error
	 */
	async delete(key: string | string[]): Promise<boolean> {
		const {store} = this.opts;
		if (Array.isArray(key)) {
			const keyPrefixed = this._getKeyPrefixArray(key);
			this.hooks.trigger(KeyvHooks.PRE_DELETE, {key: keyPrefixed});
			if (store.deleteMany !== undefined) {
				return store.deleteMany(keyPrefixed);
			}

			const promises = keyPrefixed.map(async key => store.delete(key));

			const results = await Promise.allSettled(promises);
			const returnResult = results.every(x => (x as PromiseFulfilledResult<any>).value === true);
			this.hooks.trigger(KeyvHooks.POST_DELETE, {key: keyPrefixed, value: returnResult});
			return returnResult;
		}

		const keyPrefixed = this._getKeyPrefix(key);
		this.hooks.trigger(KeyvHooks.PRE_DELETE, {key: keyPrefixed});

		let result = true;

		try {
			const value = await store.delete(keyPrefixed);

			if (typeof value === 'boolean') {
				result = value;
			}
		} catch (error) {
			result = false;
			this.emit('error', error);
		}

		this.hooks.trigger(KeyvHooks.POST_DELETE, {key: keyPrefixed, value: result});
		this.stats.delete();

		return result;
	}

	/**
	 * Clear the store
	 * @returns {void}
	 */
	async clear(): Promise<void> {
		this.emit('clear');
		const {store} = this.opts;

		try {
			await store.clear();
		} catch (error) {
			this.emit('error', error);
		}
	}

	/**
	 * Has a key
	 * @param {string} key the key to check
	 * @returns {boolean} will return true if the key exists
	 */
	async has(key: string): Promise<boolean> {
		const keyPrefixed = this._getKeyPrefix(key);
		const {store} = this.opts;
		if (store.has !== undefined && !(store instanceof Map)) {
			return store.has(keyPrefixed);
		}

		let rawData: any;

		try {
			rawData = await store.get(keyPrefixed);
		} catch (error) {
			this.emit('error', error);
		}

		if (rawData) {
			const data = await this.deserializeData(rawData) as any;
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
	 * Will disconnect the store. This is only available if the store has a disconnect method
	 * @returns {Promise<void>}
	 */
	async disconnect(): Promise<void> {
		const {store} = this.opts;
		this.emit('disconnect');
		if (typeof store.disconnect === 'function') {
			return store.disconnect();
		}
	}

	public emit(event: string, ...arguments_: any[]): void {
		if (event === 'error' && !this.opts.emitErrors) {
			return;
		}

		super.emit(event, ...arguments_);
	}

	public async serializeData<T>(data: DeserializedData<T>): Promise<string | DeserializedData<T>> {
		if (!this._serialize) {
			return data;
		}

		if (this._compression?.compress) {
			return this._serialize({value: await this._compression.compress(data.value), expires: data.expires});
		}

		return this._serialize(data);
	}

	public async deserializeData<T>(data: string | DeserializedData<T>): Promise<DeserializedData<T> | undefined> {
		if (!this._deserialize) {
			return data as DeserializedData<T>;
		}

		if (this._compression?.decompress && typeof data === 'string') {
			const result = await this._deserialize(data);
			return {value: await this._compression.decompress(result?.value), expires: result?.expires};
		}

		if (typeof data === 'string') {
			return this._deserialize(data);
		}

		return undefined;
	}
}

export default Keyv;
