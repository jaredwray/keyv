import EventEmitter from "node:events";
import Redis from "iovalkey";
import Keyv, { type KeyvStoreAdapter, type StoredData } from "keyv";
import type { KeyvUriOptions, KeyvValkeyOptions } from "./types.js";

class KeyvValkey extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport = true;
	namespace?: string;
	opts: Record<string, unknown>;
	// biome-ignore lint/suspicious/noExplicitAny: type format
	redis: any;
	constructor(
		uri: KeyvValkeyOptions | KeyvUriOptions,
		options?: KeyvValkeyOptions,
	) {
		super();
		this.opts = {};
		this.opts.useRedisSets = true;
		this.opts.dialect = "redis";

		if (
			typeof uri !== "string" &&
			"options" in uri &&
			uri.options &&
			("family" in uri.options || uri.isCluster)
		) {
			this.redis = uri;
		} else {
			options = {
				...(typeof uri === "string" ? { uri } : (uri as KeyvValkeyOptions)),
				...options,
			};
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			this.redis = new Redis(options.uri!, options);
		}

		if (options !== undefined && options.useRedisSets === false) {
			this.opts.useRedisSets = false;
		}

		this.redis.on("error", (error: Error) => this.emit("error", error));
	}

	_getNamespace(): string {
		if (this.namespace) {
			return `namespace:${this.namespace}`;
		}

		return `namespace:`;
	}

	_getKeyName = (key: string): string => {
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

	async getMany<Value>(
		keys: string[],
	): Promise<Array<StoredData<Value | undefined>>> {
		keys = keys.map(this._getKeyName);
		return this.redis.mget(keys);
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number) {
		if (value === undefined) {
			return undefined;
		}

		key = this._getKeyName(key);

		// biome-ignore lint/suspicious/noExplicitAny: type format
		const set = async (redis: any) => {
			if (typeof ttl === "number") {
				await redis.set(key, value, "PX", ttl);
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
		// biome-ignore lint/suspicious/noExplicitAny: allowed
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
		const deletePromises = keys.map(async (key) => this.delete(key));
		const results = await Promise.allSettled(deletePromises);
		// @ts-expect-error - results is an array of objects with status and value
		return results.every((result) => result.value);
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
			const pattern = `${this._getNamespace()}:*`;
			const keys: string[] = await this.redis.keys(pattern);
			if (keys.length > 0) {
				await this.redis.unlink(keys);
			}
		}
	}

	async *iterator(namespace?: string) {
		const scan = this.redis.scan.bind(this.redis);
		const get = this.redis.mget.bind(this.redis);
		let cursor = "0";
		do {
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const [curs, keys] = await scan(cursor, "MATCH", `${namespace!}:*`);
			cursor = curs;
			if (keys.length > 0) {
				const values = await get(keys);
				for (const [i] of keys.entries()) {
					const key = keys[i];
					const value = values[i];
					yield [key, value];
				}
			}
		} while (cursor !== "0");
	}

	async has(key: string) {
		key = this._getKeyName(key);
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
export function createKeyv(
	connect?: KeyvValkeyOptions | KeyvUriOptions,
	options?: KeyvValkeyOptions,
): Keyv {
	connect ??= "redis://localhost:6379";
	const adapter = new KeyvValkey(connect, options);
	const keyv = new Keyv(adapter);
	return keyv;
}

export default KeyvValkey;
export type { KeyvValkeyOptions } from "./types.js";
