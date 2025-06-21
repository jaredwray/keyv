import EventEmitter from 'events';
import Redis from 'iovalkey';
import Keyv, {type KeyvStoreAdapter, type StoredData} from 'keyv';
import {
	type KeyvValkeyOptions,
	type KeyvUriOptions,
} from './types.js';

class KeyvValkey extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport = true;
	namespace?: string;
	opts: Record<string, unknown>;
	redis: any;
	constructor(uri: KeyvValkeyOptions | KeyvUriOptions, options?: KeyvValkeyOptions) {
		super();
		this.opts = {};
		this.opts.useRedisSets = true;
		this.opts.dialect = 'redis';

		if (typeof uri !== 'string' && uri.options && ('family' in uri.options || uri.isCluster)) {
			this.redis = uri;
		} else {
			options = {...(typeof uri === 'string' ? {uri} : uri as KeyvValkeyOptions), ...options};
			// @ts-expect-error - uri is a string or RedisOptions
			this.redis = new Redis(options.uri!, options);
		}

		if (options !== undefined && options.useRedisSets === false) {
			this.opts.useRedisSets = false;
		}

		this.redis.on('error', (error: Error) => this.emit('error', error));
	}

	_getNamespace(): string {
		return `namespace:${this.namespace!}`;
	}

	_getKeyName = (key: string): string => {
		if (!this.opts.useRedisSets) {
			return `sets:${this._getNamespace()}:${key}`;
		}

		return key;
	};

	async get<Value>(key: string): Promise<StoredData<Value> | undefined> {
		key = this._getKeyName(key);

		const value = await this.redis.get(key);
		if (value === null) {
			return undefined;
		}

		return value;
	}

	async getMany<Value>(keys: string[]): Promise<Array<StoredData<Value | undefined>>> {
		keys = keys.map(this._getKeyName);
		return this.redis.mget(keys);
	}

	async set(key: string, value: any, ttl?: number) {
		if (value === undefined) {
			return undefined;
		}

		key = this._getKeyName(key);

		const set = async (redis: any) => {
			if (typeof ttl === 'number') {
				await redis.set(key, value, 'PX', ttl);
			} else {
				await redis.set(key, value);
			}
		};

		if (this.opts.useRedisSets) {
			const trx = await this.redis.multi();
			await set(trx);
			await trx.sadd(this._getNamespace(), key);
			await trx.exec();
		} else {
			await set(this.redis);
		}
	}

	async delete(key: string) {
		key = this._getKeyName(key);
		let items = 0;
		const unlink = async (redis: any) => redis.unlink(key);

		if (this.opts.useRedisSets) {
			const trx = this.redis.multi();
			await unlink(trx);
			await trx.srem(this._getNamespace(), key);
			const r = await trx.exec();
			items = r[0][1];
		} else {
			items = await unlink(this.redis);
		}

		return items > 0;
	}

	async deleteMany(keys: string[]) {
		const deletePromises = keys.map(async key => this.delete(key));
		const results = await Promise.allSettled(deletePromises);
		// @ts-expect-error - results is an array of objects with status and value
		return results.every(result => result.value);
	}

	async clear() {
		if (this.opts.useRedisSets) {
			const keys: string[] = await this.redis.smembers(this._getNamespace());
			if (keys.length > 0) {
				await Promise.all([
					this.redis.unlink([...keys]),
					this.redis.srem(this._getNamespace(), [...keys]),
				]);
			}
		} else {
			const pattern = `sets:${this._getNamespace()}:*`;
			const keys: string[] = await this.redis.keys(pattern);
			if (keys.length > 0) {
				await this.redis.unlink(keys);
			}
		}
	}

	async * iterator(namespace?: string) {
		const scan = this.redis.scan.bind(this.redis);
		const get = this.redis.mget.bind(this.redis);
		let cursor = '0';
		do {
			// eslint-disable-next-line no-await-in-loop
			const [curs, keys] = await scan(cursor, 'MATCH', `${namespace!}:*`);
			cursor = curs;
			if (keys.length > 0) {
				// eslint-disable-next-line no-await-in-loop
				const values = await get(keys);
				for (const [i] of keys.entries()) {
					const key = keys[i];
					const value = values[i];
					yield [key, value];
				}
			}
		} while (cursor !== '0');
	}

	async has(key: string) {
		const value: number = await this.redis.exists(key);
		return value !== 0;
	}

	async disconnect() {
		return this.redis.disconnect();
	}
}

/**
 * Will create a Keyv instance with the Valkey adapter.
 * @param {KeyvValkeyOptions | KeyvUriOptions} connect - How to connect to the Valkey server. If string pass in the url, if object pass in the options.
 * @param {KeyvValkeyOptions} options - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Keyv} - Keyv instance with the Redis adapter
 */
export function createKeyv(connect?: KeyvValkeyOptions | KeyvUriOptions, options?: KeyvValkeyOptions): Keyv {
	connect ??= 'redis://localhost:6379';
	const adapter = new KeyvValkey(connect, options);
	const keyv = new Keyv(adapter);
	return keyv;
}

export default KeyvValkey;
export type {KeyvValkeyOptions} from './types.js';
