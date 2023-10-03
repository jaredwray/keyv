import EventEmitter from 'events';
import JSONB from 'json-buffer';
import type {Options, Store} from "./types";

interface IteratorFunction {
	(arg: any): AsyncGenerator<any, void, unknown>;
}

const loadStore = <Value> (options: Options<Value>): Map<any, any> => {
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
		adapter = (matchResult ? matchResult[0] : undefined) as unknown as Options<Value>['adapter'];
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

class Keyv<Value = any> extends EventEmitter {
	opts: Options<Value>;
	constructor(uri?: string | Options<Value>, opts: Options<Value> = {}) {
		super();
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
		if (typeof this.opts.store![Symbol.iterator] === 'function' && this.opts.store instanceof Map) {
			// @ts-ignore
			this.iterator = this.generateIterator(this.opts.store);
		} else if (this.opts.store!.iterator && this.opts.store!.opts && this._checkIterableAdaptar()) {
			// @ts-ignore
			this.iterator = this.generateIterator(this.opts.store.iterator.bind(this.opts.store));
		}
	}

	generateIterator(iterator: IteratorFunction) :IteratorFunction {
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

	_checkIterableAdaptar() {
		return iterableAdapters.includes(this.opts.store!.opts.dialect)
			|| iterableAdapters.findIndex(element => this.opts.store!.opts.url.includes(element)) >= 0;
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

	async get(key: string | string[], options?: {raw: boolean}) {
		const {store} = this.opts;
		const isArray = Array.isArray(key);
		const keyPrefixed = isArray ? this._getKeyPrefixArray(key as any as Array<string>) : this._getKeyPrefix(key);

		if (isArray && store!.getMany === undefined) {
			const results = [];
			for (const k of keyPrefixed) {
				try {
					let data = await store!.get(k);
					data = (typeof data === 'string') ? this.opts.deserialize!(data) : (this.opts.compression ? this.opts.deserialize!(data) : data)
					if (data === undefined || data === null) {
						results.push(undefined);
					} else if (typeof data.expires === 'number' && Date.now() > data.expires) {
						await this.delete(k);
						results.push(undefined);
					} else {
						results.push(options && options.raw ? data : data.value);
					}
				} catch (error) {
					results.push(undefined);
				}
			}
			return results;
		}

		try {
			let data = isArray ? await store!.getMany!(keyPrefixed) : await store!.get(keyPrefixed);
			data = (typeof data === 'string') ? this.opts.deserialize!(data) : (this.opts.compression ? this.opts.deserialize!(data) : data)

			if (data === undefined || data === null) {
				return undefined;
			}

			if (isArray) {
				return data.map(async (row: any, index: number) => {
					if (row === 'string') {
						row = this.opts.deserialize!(row);
					}

					if (row === undefined || row === null) {
						return undefined;
					}

					if (typeof row.expires === 'number' && Date.now() > row.expires) {
						await this.delete((key as any as Array<string>)[index]);
						return undefined;
					}

					return (options && options.raw) ? row : row.value;
				});
			}

			if (typeof data.expires === 'number' && Date.now() > data.expires) {
				await this.delete(key);
				return undefined;
			}

			return (options && options.raw) ? data : data.value;
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

		// @ts-ignore
		value = this.opts.serialize(value);
		await store!.set(keyPrefixed, value, ttl)

		return true;
	}

	async delete(key: string) {
		const {store} = this.opts;
		if (Array.isArray(key)) {
			const keyPrefixed = this._getKeyPrefixArray(key as Array<string>);
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
		await store!.delete(keyPrefixed);
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
