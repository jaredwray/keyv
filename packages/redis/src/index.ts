import EventEmitter from 'events';
import Redis from 'ioredis';
import {
	type ClearOutput,
	type DeleteOutput,
	type DisconnectOutput,
	type GetManyOutput,
	type GetOutput,
	type HasOutput,
	type IteratorOutput,
	type KeyvRedisOptions,
	type KeyvUriOptions,
	type SetOutput,
} from './types';

class KeyvRedis<Value = any> extends EventEmitter {
	ttlSupport = true;
	namespace?: string;
	opts: Record<string, unknown>;
	redis: any;
	constructor(uri: KeyvRedisOptions | KeyvUriOptions, options?: KeyvRedisOptions) {
		super();
		this.opts = {};
		this.opts.useRedisSets = true;
		this.opts.dialect = 'redis';

		if (typeof uri !== 'string' && uri.options && ('family' in uri.options || uri.isCluster)) {
			this.redis = uri;
		} else {
			options = {...(typeof uri === 'string' ? {uri} : uri as KeyvRedisOptions), ...options};
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
			return `sets:${key}`;
		}

		return key;
	};

	async get(key: string): GetOutput<Value> {
		key = this._getKeyName(key);

		const value: Value = await this.redis.get(key);
		if (value === null) {
			return undefined;
		}

		return value;
	}

	async getMany(keys: string[]): GetManyOutput<Value> {
		keys = keys.map(this._getKeyName);
		return this.redis.mget(keys);
	}

	async set(key: string, value: Value, ttl?: number): SetOutput {
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

	async delete(key: string): DeleteOutput {
		key = this._getKeyName(key);
		let items = 0;
		const del = async (redis: any) => redis.del(key);

		if (this.opts.useRedisSets) {
			const trx = this.redis.multi();
			await del(trx);
			await trx.srem(this._getNamespace(), key);
			const r = await trx.exec();
			items = r[0][1];
		} else {
			items = await del(this.redis);
		}

		return items > 0;
	}

	async deleteMany(keys: string[]): DeleteOutput {
		const deletePromises = keys.map(async key => this.delete(key));
		const results = await Promise.allSettled(deletePromises);
		// @ts-expect-error - results is an array of objects with status and value
		return results.every(result => result.value);
	}

	async clear(): ClearOutput {
		if (this.opts.useRedisSets) {
			const keys: string[] = await this.redis.smembers(this._getNamespace());
			if (keys.length > 0) {
				await Promise.all([
					this.redis.del([...keys]),
					this.redis.srem(this._getNamespace(), [...keys]),
				]);
			}
		} else {
			const pattern = 'sets:*';
			const keys: string[] = await this.redis.keys(pattern);
			await this.redis.del(keys);
		}
	}

	async * iterator(namespace?: string): IteratorOutput {
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

	async has(key: string): HasOutput {
		const value: number = await this.redis.exists(key);
		return value !== 0;
	}

	async disconnect(): DisconnectOutput {
		return this.redis.disconnect();
	}
}

export = KeyvRedis;
