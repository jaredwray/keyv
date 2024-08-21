import {defaultSerialize, defaultDeserialize} from '@keyv/serialize';
import HooksManager from './hooks-manager.js';
import EventManager from './event-manager.js';
import StatsManager from './stats-manager.js';

export type DeserializedData<Value> = {
	value?: Value;
	expires?: number;
};

export interface CompressionAdapter {
	compress(value: any, options?: any): Promise<any>;
	decompress(value: any, options?: any): Promise<any>;
	serialize<Value>(data: DeserializedData<Value>): Promise<string> | string;
	deserialize<Value>(data: string): Promise<DeserializedData<Value> | undefined> | DeserializedData<Value> | undefined;
}

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
	serialize?: CompressionAdapter['serialize'];
	/** A custom deserialization function. */
	deserialize?: CompressionAdapter['deserialize'];
	/** The storage adapter instance to be used by Keyv. */
	store?: KeyvStoreAdapter | Map<any, any> | any;
	/** Default TTL. Can be overridden by specifying a TTL on `.set()`. */
	ttl?: number;
	/** Enable compression option **/
	compression?: CompressionAdapter | any;
	/** Enable or disable statistics (default is false) */
	stats?: boolean;
};

type KeyvOptions_ = Omit<KeyvOptions, 'store'> & {store: KeyvStoreAdapter | Map<any, any> & KeyvStoreAdapter};

type IteratorFunction = (argument: any) => AsyncGenerator<any, void>;

const iterableAdapters = [
	'sqlite',
	'postgres',
	'mysql',
	'mongo',
	'redis',
	'tiered',
];

export class Keyv extends EventManager {
	opts: KeyvOptions_;
	iterator?: IteratorFunction;
	hooks = new HooksManager();
	stats = new StatsManager(false);

	constructor(store?: KeyvStoreAdapter | KeyvOptions | Map<any, any>, options?: Omit<KeyvOptions, 'store'>);
	constructor(options?: KeyvOptions);
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

		if (this.opts.compression) {
			const compression = this.opts.compression;
			this.opts.serialize = compression.serialize.bind(compression);
			this.opts.deserialize = compression.deserialize.bind(compression);
		}

		if (this.opts.store) {
			if (!this._isValidStorageAdapter(this.opts.store)) {
				throw new Error('Invalid storage adapter');
			}

			if (typeof this.opts.store.on === 'function' && this.opts.emitErrors) {
				this.opts.store.on('error', (error: any) => this.emit('error', error));
			}

			this.opts.store.namespace = this.opts.namespace;

			// Attach iterators
			// @ts-ignore
			if (typeof this.opts.store[Symbol.iterator] === 'function' && this.opts.store instanceof Map) {
				this.iterator = this.generateIterator((this.opts.store as unknown as IteratorFunction));
			} else if ('iterator' in this.opts.store && this.opts.store.opts && this._checkIterableAdapter()) {
				this.iterator = this.generateIterator(this.opts.store.iterator!.bind(this.opts.store));
			}
		}

		if (this.opts.stats) {
			this.stats.enabled = this.opts.stats;
		}
	}

	generateIterator(iterator: IteratorFunction): IteratorFunction {
		const function_: IteratorFunction = async function * (this: any) {
			for await (const [key, raw] of (typeof iterator === 'function'
				? iterator(this.opts.store.namespace)
				: iterator)) {
				const data = await this.opts.deserialize(raw);
				if (this.opts.store.namespace && !key.includes(this.opts.store.namespace)) {
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
		return iterableAdapters.includes((this.opts.store.opts.dialect as string))
			|| iterableAdapters.some(element => (this.opts.store.opts.url as string).includes(element));
	}

	_getKeyPrefix(key: string): string {
		return `${this.opts.namespace}:${key}`;
	}

	_getKeyPrefixArray(keys: string[]): string[] {
		return keys.map(key => `${this.opts.namespace}:${key}`);
	}

	_getKeyUnprefix(key: string): string {
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

	async get<Value>(key: string, options?: {raw: false}): Promise<StoredDataNoRaw<Value>>;
	async get<Value>(key: string, options?: {raw: true}): Promise<StoredDataRaw<Value>>;
	async get<Value>(key: string[], options?: {raw: false}): Promise<Array<StoredDataNoRaw<Value>>>;
	async get<Value>(key: string[], options?: {raw: true}): Promise<Array<StoredDataRaw<Value>>>;
	async get<Value>(key: string | string[], options?: {raw: boolean}): Promise<StoredDataNoRaw<Value> | Array<StoredDataNoRaw<Value>> | StoredDataRaw<Value> | Array<StoredDataRaw<Value>>> {
		const {store} = this.opts;
		const isArray = Array.isArray(key);
		const keyPrefixed = isArray ? this._getKeyPrefixArray(key) : this._getKeyPrefix(key);

		const isDataExpired = (data: DeserializedData<Value>): boolean => typeof data.expires === 'number' && Date.now() > data.expires;

		if (isArray) {
			this.hooks.trigger(KeyvHooks.PRE_GET_MANY, {keys: keyPrefixed});
			if (store.getMany === undefined) {
				const promises = (keyPrefixed as string[]).map(async key => {
					const rawData = await store.get<Value>(key);
					const deserializedRow = (typeof rawData === 'string' || this.opts.compression) ? await this.opts.deserialize!<Value>(rawData as string) : rawData;

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
					row = await this.opts.deserialize!<Value>(row);
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
		const deserializedData = (typeof rawData === 'string' || this.opts.compression) ? await this.opts.deserialize!<Value>(rawData as string) : rawData;

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

	async set(key: string, value: any, ttl?: number): Promise<boolean> {
		this.hooks.trigger(KeyvHooks.PRE_SET, {key, value, ttl});
		const keyPrefixed = this._getKeyPrefix(key);
		if (typeof ttl === 'undefined') {
			ttl = this.opts.ttl;
		}

		if (ttl === 0) {
			ttl = undefined;
		}

		const {store} = this.opts;

		const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;

		if (typeof value === 'symbol') {
			this.emit('error', 'symbol cannot be serialized');
		}

		value = {value, expires};

		value = await this.opts.serialize!(value);
		await store.set(keyPrefixed, value, ttl);
		this.hooks.trigger(KeyvHooks.POST_SET, {key: keyPrefixed, value, ttl});
		this.stats.set();
		return true;
	}

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
			this.hooks.trigger(KeyvHooks.POST_DELETE, returnResult);
			return returnResult;
		}

		const keyPrefixed = this._getKeyPrefix(key);
		const result = store.delete(keyPrefixed);
		this.hooks.trigger(KeyvHooks.POST_DELETE, result);
		this.stats.delete();
		return result;
	}

	async clear(): Promise<void> {
		this.emit('clear');
		const {store} = this.opts;
		await store.clear();
	}

	async has(key: string): Promise<boolean> {
		const keyPrefixed = this._getKeyPrefix(key);
		const {store} = this.opts;
		if (store.has !== undefined && !(store instanceof Map)) {
			return store.has(keyPrefixed);
		}

		const rawData = await store.get(keyPrefixed) as any;
		if (rawData) {
			const data = this.opts.deserialize!(rawData) as any;
			if (data) {
				if (data.expires === undefined || data.expires === null) {
					return true;
				}

				return data.expires > Date.now();
			}
		}

		return false;
	}

	async disconnect(): Promise<void> {
		const {store} = this.opts;
		this.emit('disconnect');
		if (typeof store.disconnect === 'function') {
			return store.disconnect();
		}
	}
}

export default Keyv;