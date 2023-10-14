import EventEmitter from 'events';
import JSONB from 'json-buffer';
import type {DeserializedData, Options, StoredData} from "./types";
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

	_getKeyPrefixArray(keys: Array<string>) {
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
		const keyPrefixed = isArray ? this._getKeyPrefixArray(key as string[]) : this._getKeyPrefix(key as string);

		const isDataExpired = (data: DeserializedData<Value>): boolean => {
			return typeof data.expires === 'number' && Date.now() > data.expires;
		};

		if (isArray && store?.getMany === undefined) {
			const results = [];
			for (const k of keyPrefixed) {
				try {
					const storeData = await store!.get<Value>(k);
					const shouldDeserialize = typeof storeData === 'string' || !!this.opts.compression;
					const data = shouldDeserialize ? this.opts.deserialize!<Value>(storeData as string) : storeData;

					if(data === undefined || data === null){
						results.push(undefined);
						continue;
					}

					if (isDataExpired(data as DeserializedData<Value>)) {
						await this.delete(k);
						results.push(undefined);
						continue;
					}

					if(options?.raw) {
						results.push(data)
						continue;
					}

					results.push((data as DeserializedData<Value>).value)

				} catch (error) {
					results.push(undefined);
				}
			}
			return results;
		}

		try {
			const storeData = isArray ? await store!.getMany!(keyPrefixed as string[]) : await store!.get(keyPrefixed as string);
			const shouldDeserialize = typeof storeData === 'string' || this.opts.compression;
			const data = shouldDeserialize ? this.opts.deserialize!(storeData as string) : storeData;

			if (data === undefined || data === null) {
				return undefined;
			}

			if (isArray) {
				return (data as StoredData<Value>[]).map(async (row, index: number) => {
					if (row === 'string') {
						row = this.opts.deserialize!(row as string);
					}

					if (row === undefined || row === null) {
						return undefined;
					}

					if (isDataExpired(row as DeserializedData<Value>)) {
						await this.delete((key as string[])[index]);
						return undefined;
					}

					if(options?.raw) return row;

					return (row as DeserializedData<Value>)!.value
				});
			}

			if (isDataExpired(data as DeserializedData<Value>)) {
				await this.delete(key);
				return undefined;
			}

			if(options?.raw) return data;

			return (data as DeserializedData<Value>)!.value
		} catch (error) {
			return undefined;
		}
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
