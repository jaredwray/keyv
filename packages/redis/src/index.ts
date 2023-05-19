import EventEmitter from 'events';
import Redis from 'ioredis';
import type {RedisOptions, Cluster} from 'ioredis';
import {type StoredData} from 'keyv';
import {
	type ClearOutput,
	type DeleteManyOutput,
	type DeleteOutput, type DisconnectOutput,
	type GetManyOutput,
	type GetOutput, type HasOutput, type IteratorOutput,
	type KeyvOptions,
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

		// @ts-expect-error - family doesn't exist on RedisOptions
		if ((uri.options?.family) || (uri.options && uri.isCluster)) {
			this.redis = uri as Cluster;
		} else {
			options = {...(typeof uri === 'string' ? {uri} : uri as KeyvOptions), ...options};
			this.redis = new Redis(options.uri!, options as RedisOptions);
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

		await (typeof ttl === 'number' ? this.redis.set(key, value as Value, 'PX', ttl) : this.redis.set(key, value as Value));

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
		// @ts-expect-error - iterator
		async function * iterate(curs, pattern) {
			const [cursor, keys] = await scan(curs, 'MATCH', pattern);

			if (keys.length > 0) {
				const values = await get(keys);
				for (const [i] of keys.entries()) {
					const key = keys[i];
					const value = values[i];
					yield [key, value];
				}
			}

			if (cursor !== '0') {
				yield * iterate(cursor, pattern);
			}
		}

		yield * iterate(0, `${namespace!}:*`);
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
