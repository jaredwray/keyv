import EventEmitter from 'events';
import JSONB from 'json-buffer';
import type {DeserializedData, Options, StoredData, StoredDataRaw, StoredDataNoRaw} from "./types";
import type keyvModule from './types';

interface IteratorFunction {
	(arg: any): AsyncGenerator<any, void, unknown>;
}

const loadStore = (options: Options) => {
	const adapters: { [key: string]: string; } = {
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
	let adapter = options.adapter;
	if (!adapter && options.uri) {
		const matchResult = /^[^:+]*/.exec(options.uri);
		adapter = (matchResult ? matchResult[0] : undefined) as unknown as Options['adapter'];
	}
	if (adapter) {
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

class Keyv extends EventEmitter implements keyvModule{
	opts: Options;
	iterator?: IteratorFunction;
	constructor(uri?: string | Options, opts?: Options) {
		super();
		opts = opts || {};
		const options = {
			...((typeof uri === 'string') ? {uri} : uri),
			...opts,
		};
		this.opts = {
			namespace: 'keyv',
			serialize: JSONB.stringify,
			deserialize: JSONB.parse,
			...options,
		};

		if (!this.opts.store) {
			const adapterOptions = {...this.opts};
			this.opts.store = loadStore(adapterOptions);
		}

		if (this.opts.compression) {
			const compression = this.opts.compression;
			this.opts.serialize = compression.serialize!.bind(compression);
			this.opts.deserialize = compression.deserialize!.bind(compression);
		}

		if (typeof this.opts.store!.on === 'function') {
			this.opts.store!.on('error', (error: any) => this.emit('error', error));
		}

		this.opts.store!.namespace = this.opts.namespace;

		// Attach iterators
		// @ts-ignore
		if (typeof this.opts.store![Symbol.iterator] === 'function' && this.opts.store instanceof Map) {
			this.iterator = this.generateIterator(<IteratorFunction><unknown>this.opts.store);
		} else if (this.opts.store!.iterator && this.opts.store!.opts && this._checkIterableAdapter()) {
			// @ts-ignore
			this.iterator = this.generateIterator(this.opts.store.iterator.bind(this.opts.store));
		}
	}

	generateIterator(iterator: IteratorFunction)  {
		const func : IteratorFunction = async function * (this: any) {
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

	_checkIterableAdapter() {
		return iterableAdapters.includes(<string><unknown>this.opts.store?.opts.dialect)
			|| iterableAdapters.findIndex(element => (<string><unknown>this.opts.store?.opts!.url).includes(element)) >= 0;
	}

	_getKeyPrefix(key: string) {
		return `${this.opts.namespace}:${key}`;
	}

	_getKeyPrefixArray(keys: string[]) {
		return keys.map(key => `${this.opts.namespace}:${key}`);
	}

	_getKeyUnprefix(key: string) {
		return key
			.split(':')
			.splice(1)
			.join(':');
	}

	async get<Value>(key: string | string[], options?: {raw: boolean}) {
		const {store} = this.opts;
		const isArray = Array.isArray(key);
		const keyPrefixed = isArray ? this._getKeyPrefixArray(key) : this._getKeyPrefix(key);

		const isDataExpired = (data: DeserializedData<Value>): boolean => {
			return typeof data.expires === 'number' && Date.now() > data.expires;
		};

		if(isArray) {
			if(store?.getMany === undefined) {
				const promises = (keyPrefixed as string[]).map(async (key) => {
					const rawData = await store!.get<Value>(key);
					const deserializedRow = (typeof rawData === 'string' || this.opts.compression) ? this.opts.deserialize!<Value>(rawData as string) : rawData;

					if(deserializedRow === undefined || deserializedRow === null){
						return undefined;
					}

					if(isDataExpired(deserializedRow as DeserializedData<Value>)){
						await this.delete(key);
						return undefined;
					}

					return (options && options.raw) ? deserializedRow as StoredDataRaw<Value> : (deserializedRow as DeserializedData<Value>).value as StoredDataNoRaw<Value>;
				})

				const deserializedRows = await Promise.allSettled(promises);
				return deserializedRows.map((row) => (row as PromiseFulfilledResult<StoredData<Value>>).value)
			}

			const rawData = await store.getMany<Value>(keyPrefixed as string[]);

			const result = [];
			for (let index in rawData) {
				let row = rawData[index];

				if ((typeof row === 'string')) {
					row = this.opts.deserialize!<Value>(row);
				}

				if (row === undefined || row === null) {
					result.push(undefined);
					continue;
				}

				if(isDataExpired(row as DeserializedData<Value>)){
					await this.delete(key[index]);
					result.push(undefined);
					continue;
				}

				const value = (options && options.raw) ? row: (row as DeserializedData<Value>).value;
				result.push(value);
			}
			return result;
		}

		const rawData = await store!.get<Value>(keyPrefixed as string);
		const deserializedData = (typeof rawData === 'string' || this.opts.compression) ? this.opts.deserialize!<Value>(rawData as string) : rawData;

		if (deserializedData === undefined || deserializedData === null) {
			return undefined;
		}

		if(isDataExpired(deserializedData as DeserializedData<Value>)){
			await this.delete(key);
			return undefined;
		}

		return (options && options.raw) ? deserializedData: (deserializedData as DeserializedData<Value>).value;

	}


	async set(key: string, value: any, ttl?: number) {
		const keyPrefixed = this._getKeyPrefix(key);
		if (typeof ttl === 'undefined') {
			ttl = this.opts.ttl;
		}

		if (ttl === 0) {
			ttl = undefined;
		}

		const {store} = this.opts;

		const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;
		value = {value, expires};

		value = this.opts!.serialize!(value);
		await store!.set(keyPrefixed, value, ttl)

		return true;
	}

	async delete(key: string | string[]) {
		const {store} = this.opts;
		if (Array.isArray(key)) {
			const keyPrefixed = this._getKeyPrefixArray(key as string[]);
			if (store!.deleteMany !== undefined) {
				await store!.deleteMany(keyPrefixed);
				return;
			}

			const results = [];
			for (const k of keyPrefixed) {
				results.push(await store!.delete(k));
			}
			return results;
		}

		const keyPrefixed = this._getKeyPrefix(key);
		return store!.delete(keyPrefixed);
	}

	async clear() {
		const {store} = this.opts;
		await store!.clear();
	}

	async has(key: string) {
		const keyPrefixed = this._getKeyPrefix(key);
		const {store} = this.opts;
		if (typeof store!.has === 'function') {
			return store!.has(keyPrefixed);
		}
		const value = await store!.get(keyPrefixed);
		return value !== undefined;
	}

	async disconnect() {
		const {store} = this.opts;
		if (typeof store!.disconnect === 'function') {
			return store!.disconnect();
		}
	}
}

export default Keyv;
