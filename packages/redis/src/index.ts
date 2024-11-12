import EventEmitter from 'events';
import {createClient, type RedisClientType, type RedisClientOptions} from 'redis';
import {type KeyvStoreAdapter} from 'keyv';

export type KeyvRedisOptions = {
	namespace?: string;
	keyPrefixSeparator?: string;
	clearBatchSize?: number;
};

export type KeyvRedisPropertyOptions = KeyvRedisOptions & {
	dialect: 'redis';
	url: string;
};

export type KeyvRedisEntry<T> = {
	key: string;
	value: T;
	ttl?: number;
};

export default class KeyvRedis extends EventEmitter implements KeyvStoreAdapter {
	private _client: RedisClientType = createClient() as RedisClientType;
	private _namespace: string | undefined;
	private _keyPrefixSeparator = '::';
	private _clearBatchSize = 1000;

	constructor(connect?: string | RedisClientOptions | RedisClientType, options?: KeyvRedisOptions) {
		super();

		if (connect) {
			if (typeof connect === 'string') {
				this._client = createClient({url: connect}) as RedisClientType;
			} else if ((connect as RedisClientType).connect !== undefined) {
				this._client = connect as RedisClientType;
			} else if (connect instanceof Object) {
				this._client = createClient(connect as RedisClientOptions) as RedisClientType;
			}
		}

		this.setOptions(options);

		this.initClient();
	}

	public get client(): RedisClientType {
		return this._client;
	}

	public set client(value: RedisClientType) {
		this._client = value;
		this.initClient();
	}

	public get opts(): KeyvRedisPropertyOptions {
		return {
			namespace: this._namespace,
			keyPrefixSeparator: this._keyPrefixSeparator,
			clearBatchSize: this._clearBatchSize,
			dialect: 'redis',
			url: this._client?.options?.url ?? 'redis://localhost:6379',
		};
	}

	public set opts(options: KeyvRedisOptions) {
		this.setOptions(options);
	}

	public get namespace(): string | undefined {
		return this._namespace;
	}

	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	public get clearBatchSize(): number {
		return this._clearBatchSize;
	}

	public set clearBatchSize(value: number) {
		this._clearBatchSize = value;
	}

	public async getClient(): Promise<RedisClientType> {
		if (!this._client.isOpen) {
			await this._client.connect();
		}

		return this._client;
	}

	public async set(key: string, value: string, ttl?: number): Promise<void> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		if (ttl) {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			await client.set(key, value, {PX: ttl});
		} else {
			await client.set(key, value);
		}
	}

	public async setMany(entries: Array<KeyvRedisEntry<string>>): Promise<void> {
		const client = await this.getClient();
		const multi = client.multi();
		for (const {key, value, ttl} of entries) {
			const prefixedKey = this.createKeyPrefix(key, this._namespace);
			if (ttl) {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				multi.set(prefixedKey, value, {PX: ttl});
			} else {
				multi.set(prefixedKey, value);
			}
		}

		await multi.exec();
	}

	public async has(key: string): Promise<boolean> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		const exists = await client.exists(key);

		return exists === 1;
	}

	public async hasMany(keys: string[]): Promise<boolean[]> {
		const client = await this.getClient();
		const multi = client.multi();
		for (const key of keys) {
			const prefixedKey = this.createKeyPrefix(key, this._namespace);
			multi.exists(prefixedKey);
		}

		const results = await multi.exec();

		return results.map(result => result === 1);
	}

	public async get<T>(key: string): Promise<T | undefined> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		const value = await client.get(key);
		if (value === null) {
			return undefined;
		}

		return value as T;
	}

	public async getMany<T>(keys: string[]): Promise<Array<T | undefined>> {
		const client = await this.getClient();
		const multi = client.multi();
		for (const key of keys) {
			const prefixedKey = this.createKeyPrefix(key, this._namespace);
			multi.get(prefixedKey);
		}

		const values = await multi.exec();

		return values.map(value => value === null ? undefined : value as T);
	}

	public async delete(key: string): Promise<boolean> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		const deleted = await client.del(key);

		return deleted > 0;
	}

	public async deleteMany(keys: string[]): Promise<boolean> {
		let result = false;
		const client = await this.getClient();
		const multi = client.multi();
		for (const key of keys) {
			const prefixedKey = this.createKeyPrefix(key, this._namespace);
			multi.del(prefixedKey);
		}

		const results = await multi.exec();

		for (const deleted of results) {
			if (typeof deleted === 'number' && deleted > 0) {
				result = true;
			}
		}

		return result;
	}

	public async disconnect(): Promise<void> {
		if (this._client.isOpen) {
			await this._client.disconnect();
		}
	}

	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		if (this._namespace) {
			return `${this._namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	public getKeyWithoutPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, '');
		}

		return key;
	}

	public async * iterator<Value>(namespace?: string): AsyncGenerator<[string, Value | undefined], void, unknown> {
		const client = await this.getClient();
		const match = namespace ? `${namespace}${this._keyPrefixSeparator}*` : '*';
		let cursor = '0';
		do {
			// eslint-disable-next-line no-await-in-loop, @typescript-eslint/naming-convention
			const result = await client.scan(Number.parseInt(cursor, 10), {MATCH: match, TYPE: 'string'});
			cursor = result.cursor.toString();
			let {keys} = result;

			if (!namespace) {
				keys = keys.filter(key => !key.includes(this._keyPrefixSeparator));
			}

			if (keys.length > 0) {
				// eslint-disable-next-line no-await-in-loop
				const values = await client.mGet(keys);
				for (const [i] of keys.entries()) {
					const key = this.getKeyWithoutPrefix(keys[i], namespace);
					const value = values ? values[i] : undefined;
					yield [key, value as Value | undefined];
				}
			}
		} while (cursor !== '0');
	}

	public async clear(): Promise<void> {
		await this.clearNamespace(this._namespace);
	}

	private async clearNamespace(namespace?: string): Promise<void> {
		try {
			let cursor = '0';
			const batchSize = this._clearBatchSize;
			const match = namespace ? `${namespace}${this._keyPrefixSeparator}*` : '*';
			const client = await this.getClient();

			do {
				// Use SCAN to find keys incrementally in batches
				// eslint-disable-next-line no-await-in-loop, @typescript-eslint/naming-convention
				const result = await client.scan(Number.parseInt(cursor, 10), {MATCH: match, COUNT: batchSize, TYPE: 'string'});

				cursor = result.cursor.toString();
				let {keys} = result;

				if (keys.length === 0) {
					continue;
				}

				if (!namespace) {
					keys = keys.filter(key => !key.includes(this._keyPrefixSeparator));
				}

				if (keys.length > 0) {
					// eslint-disable-next-line no-await-in-loop
					await client.del(keys);
				}
			} while (cursor !== '0');
		/* c8 ignore next 3 */
		} catch (error) {
			this.emit('error', error);
		}
	}

	private setOptions(options?: KeyvRedisOptions): void {
		if (!options) {
			return;
		}

		if (options.namespace) {
			this._namespace = options.namespace;
		}

		if (options.keyPrefixSeparator) {
			this._keyPrefixSeparator = options.keyPrefixSeparator;
		}

		if (options.clearBatchSize) {
			this._clearBatchSize = options.clearBatchSize;
		}
	}

	private initClient(): void {
		/* c8 ignore next 3 */
		this._client.on('error', error => {
			this.emit('error', error);
		});
	}
}

export {type StoredData} from 'keyv';
export {
	createClient, createCluster, type RedisClientOptions, type RedisClientType,
} from 'redis';
