import EventEmitter from 'events';
import Redis from 'ioredis';
import {
	type ClearOutput,
	type DeleteManyOutput,
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
		this.opts.dialect = 'redis';

		if (typeof uri !== 'string' && uri.options && ('family' in uri.options || uri.isCluster)) {
			this.redis = uri;
		} else {
			options = {...(typeof uri === 'string' ? {uri} : uri as KeyvRedisOptions), ...options};
			// @ts-expect-error - uri is a string or RedisOptions
			this.redis = new Redis(options.uri!, options);
		}

		this.redis.on('error', (error: Error) => this.emit('error', error));
	}

	_getNamespace(key?: string): string {
		if (key && this.opts.useRedisSets) {
			return `namespace:sets:${key}`;
		}

		return `namespace:${this.namespace!}`;
	}

	async get(key: string): GetOutput<Value> {
		const value: Value = await this.redis.get(key);
		if (value === null) {
			return undefined;
		}

		return value;
	}

	async getMany(keys: string[]): GetManyOutput<Value> {
		return this.redis.mget(keys);
	}

	async set(key: string, value: Value, ttl?: number): SetOutput {
		if (value === undefined) {
			return undefined;
		}

		if (this.opts.useRedisSets) {
			await this.redis.set(this._getNamespace(key), value);
		} else {
			if (typeof ttl === 'number') {
				await this.redis.set(key, value, 'PX', ttl);
			} else {
				await this.redis.set(key, value);
			}

			await this.redis.sadd(this._getNamespace(), key);
		}
	}

	async delete(key: string): DeleteOutput {
		const items: number = await this.redis.del(key);
		await this.redis.srem(this._getNamespace(), key);
		return items > 0;
	}

	async deleteMany(key: string): DeleteManyOutput {
		return this.delete(key);
	}

	async clear(): ClearOutput {
		if (this.opts.useRedisSets) {
			const pattern = 'namespace:sets*';
			const keys: string[] = await this.redis.keys(pattern);
			await this.redis.del(keys);
		} else {
			const keys: string[] = await this.redis.smembers(this._getNamespace());
			await this.redis.del([...keys, this._getNamespace()]);
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
