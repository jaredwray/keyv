import EventEmitter from 'events';
import Redis from 'ioredis';
import {type StoredData} from 'keyv';
import {
	type ClearOutput,
	type DeleteManyOutput,
	type DeleteOutput, type DisconnectOutput,
	type GetManyOutput,
	type GetOutput, type HasOutput, type IteratorOutput,
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

		if (uri instanceof Redis) {
			this.redis = uri;
		} else {
			options = {...(typeof uri === 'string' ? {uri} : uri as KeyvRedisOptions), ...options};
			// @ts-expect-error - uri is a string or RedisOptions
			this.redis = new Redis(options.uri!, options);
		}

		this.redis.on('error', (error: Error) => this.emit('error', error));
	}

	_getNamespace(): string {
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
		const rows: Array<StoredData<Value>> = await this.redis.mget(keys);
		return rows;
	}

	async set(key: string, value: Value, ttl?: number): SetOutput {
		if (value === undefined) {
			return undefined;
		}

		if (typeof ttl === 'number') {
			await this.redis.set(key, value, 'PX', ttl);
		} else {
			await this.redis.set(key, value);
		}

		await this.redis.sadd(this._getNamespace(), key);
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
		const keys: string[] = await this.redis.smembers(this._getNamespace());
		await this.redis.del([...keys, this._getNamespace()]);
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
