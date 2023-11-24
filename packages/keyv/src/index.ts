import EventEmitter from 'events';
import {HooksManager} from './hooks-manager';
import JSONB from 'json-buffer';

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
	PRE_SET_MANY = 'preSetMany',
	POST_SET_MANY = 'postSetMany',
	PRE_GET = 'preGet',
	POST_GET = 'postGet',
	PRE_GET_MANY = 'preGetMany',
	POST_GET_MANY = 'postGetMany',
	PRE_DELETE = 'preDelete',
	POST_DELETE = 'postDelete',
	PRE_CLEAR = 'preClear',
	POST_CLEAR = 'postClear',
}

export type StoredDataNoRaw<Value> = Value | undefined;

export type StoredDataRaw<Value> = DeserializedData<Value> | undefined;

export type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

export interface KeyvStoreAdapter extends EventEmitter {
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

export interface Options {
	[key: string]: any;
	/** Emit errors */
	emitErrors?: boolean;
	/** Namespace for the current instance. */
	namespace?: string;
	/** A custom serialization function. */
	serialize?: CompressionAdapter['serialize'];
	/** A custom deserialization function. */
	deserialize?: CompressionAdapter['deserialize'];
	/** The connection string URI. */
	uri?: string;
	/** The storage adapter instance to be used by Keyv. */
	store: KeyvStoreAdapter;
	/** Default TTL. Can be overridden by specififying a TTL on `.set()`. */
	ttl?: number;
	/** Enable compression option **/
	compression?: CompressionAdapter;
	/** Specify an adapter to use. e.g `'redis'` or `'mongodb'`. */
	adapter?: 'redis' | 'mongodb' | 'mongo' | 'sqlite' | 'postgresql' | 'postgres' | 'mysql';
}

type IteratorFunction = (arg: any) => AsyncGenerator<any, void>;

const loadStore = (options: Options) => {
	const adapters = {
		redis: '@keyv/redis',
		rediss: '@keyv/redis',
		mongodb: '@keyv/mongo',
		mongo: '@keyv/mongo',
		sqlite: '@keyv/sqlite',
		postgresql: '@keyv/postgres',
		postgres: '@keyv/postgres',
		mysql: '@keyv/mysql',
		etcd: '@keyv/etcd',
		offline: '@keyv/offline',
		tiered: '@keyv/tiered',
	};
	if (options.adapter ?? options.uri) {
		const adapter = (options.adapter ?? /^[^:+]*/.exec(options.uri!)![0]) as Options['adapter'];
		if (!adapter || !adapters[adapter]) {
			throw new Error(`Adapter ${adapter} is not allowed`);
		}

		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return new (require(adapters[adapter]))(options);
	}

	return new Map();
};

const iterableAdapters = [
	'sqlite',
	'postgres',
	'mysql',
	'mongo',
	'redis',
	'tiered',
];

class Keyv extends EventEmitter {
	opts: Options;
	iterator?: IteratorFunction;
	hooks = new HooksManager();
	constructor(uri?: string | Omit<Options, 'store'>, options_?: Omit<Options, 'store'>) {
		super();
		options_ = options_ ?? {};
		const options = {
			...((typeof uri === 'string') ? {uri} : uri),
			...options_,
		};
		// @ts-expect-error - store is being added in the next step
		this.opts = {
			namespace: 'keyv',
			serialize: JSONB.stringify,
			deserialize: JSONB.parse,
			emitErrors: true,
			...options,
		};

		if (!this.opts.store) {
			const adapterOptions = {...this.opts};
			this.opts.store = loadStore(adapterOptions);
		}

		if (this.opts.compression) {
			const compression = this.opts.compression;
			this.opts.serialize = compression.serialize.bind(compression);
			this.opts.deserialize = compression.deserialize.bind(compression);
		}

		if (this.opts.store) {
			if (typeof this.opts.store.on === 'function' && this.opts.emitErrors) {
				this.opts.store.on('error', (error: any) => this.emit('error', error));
			}

			this.opts.store.namespace = this.opts.namespace;

			// Attach iterators
			// @ts-expect-error
			if (typeof this.opts.store[Symbol.iterator] === 'function' && this.opts.store instanceof Map) {
				this.iterator = this.generateIterator((this.opts.store as unknown as IteratorFunction));
			} else if (this.opts.store.iterator && this.opts.store.opts && this._checkIterableAdapter()) {
				this.iterator = this.generateIterator(this.opts.store.iterator.bind(this.opts.store));
			}
		}
	}

	generateIterator(iterator: IteratorFunction): IteratorFunction {
		const func: IteratorFunction = async function * (this: any) {
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

		return func.bind(this);
	}

	_checkIterableAdapter(): boolean {
		return iterableAdapters.includes((this.opts.store.opts.dialect as string))
			|| iterableAdapters.findIndex(element => (this.opts.store.opts.url as string).includes(element)) >= 0;
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

					return (options && options.raw) ? deserializedRow as StoredDataRaw<Value> : (deserializedRow as DeserializedData<Value>).value as StoredDataNoRaw<Value>;
				});

				const deserializedRows = await Promise.allSettled(promises);
				return deserializedRows.map(row => (row as PromiseFulfilledResult<any>).value);
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

				const value = (options && options.raw) ? row as StoredDataRaw<Value> : (row as DeserializedData<Value>).value as StoredDataNoRaw<Value>;
				result.push(value);
			}

			return result as (Array<StoredDataNoRaw<Value>> | Array<StoredDataRaw<Value>>);
		}

		const rawData = await store.get<Value>(keyPrefixed as string);
		const deserializedData = (typeof rawData === 'string' || this.opts.compression) ? await this.opts.deserialize!<Value>(rawData as string) : rawData;

		if (deserializedData === undefined || deserializedData === null) {
			return undefined;
		}

		if (isDataExpired(deserializedData as DeserializedData<Value>)) {
			await this.delete(key);
			return undefined;
		}

		return (options && options.raw) ? deserializedData : (deserializedData as DeserializedData<Value>).value;
	}

	async set(key: string, value: any, ttl?: number): Promise<boolean> {
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

		return true;
	}

	async delete(key: string | string[]): Promise<boolean> {
		const {store} = this.opts;
		if (Array.isArray(key)) {
			const keyPrefixed = this._getKeyPrefixArray(key);
			if (store.deleteMany !== undefined) {
				return store.deleteMany(keyPrefixed);
			}

			const promises = keyPrefixed.map(async key => store.delete(key));

			const results = await Promise.allSettled(promises);
			return results.every(x => (x as PromiseFulfilledResult<any>).value === true);
		}

		const keyPrefixed = this._getKeyPrefix(key);
		return store.delete(keyPrefixed);
	}

	async clear(): Promise<void> {
		const {store} = this.opts;
		await store.clear();
	}

	async has(key: string): Promise<boolean> {
		const keyPrefixed = this._getKeyPrefix(key);
		const {store} = this.opts;
		return typeof store.has === 'function' ? store.has(keyPrefixed) : (await store.get(keyPrefixed)) !== undefined;
	}

	async disconnect(): Promise<void> {
		const {store} = this.opts;
		if (typeof store.disconnect === 'function') {
			return store.disconnect();
		}
	}
}

export default Keyv;
module.exports = Keyv;
