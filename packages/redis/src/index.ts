import EventEmitter from 'node:events';
import {
	createClient, createCluster, type RedisClientType, type RedisClientOptions, type RedisClusterType,
	type RedisClusterOptions,
	type RedisModules,
	type RedisFunctions,
	type RedisScripts,
} from 'redis';
import {Keyv, type KeyvStoreAdapter} from 'keyv';

export type KeyvRedisOptions = {
	/**
	 * Namespace for the current instance.
	 */
	namespace?: string;
	/**
	 * Separator to use between namespace and key.
	 */
	keyPrefixSeparator?: string;
	/**
	 * Number of keys to delete in a single batch.
	 */
	clearBatchSize?: number;
	/**
	 * Enable Unlink instead of using Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 */
	useUnlink?: boolean;

};

export type KeyvRedisPropertyOptions = KeyvRedisOptions & {
	/**
	 * Dialect used by the adapter. This is legacy so Keyv knows what is iteratable.
	 */
	dialect: 'redis';
	/**
	 * URL used to connect to the Redis server. This is legacy so Keyv knows what is iteratable.
	 */
	url: string;
};

export type KeyvRedisEntry<T> = {
	/**
	 * Key to set.
	 */
	key: string;
	/**
	 * Value to set.
	 */
	value: T;
	/**
	 * Time to live in milliseconds.
	 */
	ttl?: number;
};

export type RedisClientConnectionType = RedisClientType | RedisClusterType<RedisModules, RedisFunctions, RedisScripts>;

// eslint-disable-next-line unicorn/prefer-event-target
export default class KeyvRedis extends EventEmitter implements KeyvStoreAdapter {
	private _client: RedisClientConnectionType = createClient() as RedisClientType;
	private _namespace: string | undefined;
	private _keyPrefixSeparator = '::';
	private _clearBatchSize = 1000;
	private _useUnlink = true;

	/**
	 * KeyvRedis constructor.
	 * @param {string | RedisClientOptions | RedisClientType} [connect] How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client.
	 * @param {KeyvRedisOptions} [options] Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
	 */
	constructor(connect?: string | RedisClientOptions | RedisClusterOptions | RedisClientConnectionType, options?: KeyvRedisOptions) {
		super();

		if (connect) {
			if (typeof connect === 'string') {
				this._client = createClient({url: connect}) as RedisClientType;
			} else if ((connect as any).connect !== undefined) {
				this._client = this.isClientCluster(connect as RedisClientConnectionType) ? connect as RedisClusterType : connect as RedisClientType;
			} else if (connect instanceof Object) {
				this._client = (connect as any).rootNodes === undefined ? createClient(connect as RedisClientOptions) as RedisClientType : createCluster(connect as RedisClusterOptions) as RedisClusterType;
			}
		}

		this.setOptions(options);
		this.initClient();
	}

	/**
	 * Get the Redis client.
	 */
	public get client(): RedisClientConnectionType {
		return this._client;
	}

	/**
	 * Set the Redis client.
	 */
	public set client(value: RedisClientConnectionType) {
		this._client = value;
		this.initClient();
	}

	/**
	 * Get the options for the adapter.
	 */
	public get opts(): KeyvRedisPropertyOptions {
		let url = '';
		if ((this._client as RedisClientType).options) {
			url = (this._client as RedisClientType).options?.url ?? 'redis://localhost:6379';
		}

		const results: KeyvRedisPropertyOptions = {
			namespace: this._namespace,
			keyPrefixSeparator: this._keyPrefixSeparator,
			clearBatchSize: this._clearBatchSize,
			dialect: 'redis',
			url,
		};

		return results;
	}

	/**
	 * Set the options for the adapter.
	 */
	public set opts(options: KeyvRedisOptions) {
		this.setOptions(options);
	}

	/**
	 * Get the namespace for the adapter. If undefined, it will not use a namespace including keyPrefixing.
	 * @default undefined
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. If undefined, it will not use a namespace including keyPrefixing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the separator between the namespace and key.
	 * @default '::'
	 */
	public get keyPrefixSeparator(): string {
		return this._keyPrefixSeparator;
	}

	/**
	 * Set the separator between the namespace and key.
	 */
	public set keyPrefixSeparator(value: string) {
		this._keyPrefixSeparator = value;
	}

	/**
	 * Get the number of keys to delete in a single batch.
	 * @default 1000
	 */
	public get clearBatchSize(): number {
		return this._clearBatchSize;
	}

	/**
	 * Set the number of keys to delete in a single batch.
	 */
	public set clearBatchSize(value: number) {
		this._clearBatchSize = value;
	}

	/**
	 * Get if Unlink is used instead of Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 * @default true
	 */
	public get useUnlink(): boolean {
		return this._useUnlink;
	}

	/**
	 * Set if Unlink is used instead of Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 */
	public set useUnlink(value: boolean) {
		this._useUnlink = value;
	}

	/**
	 * Get the Redis URL used to connect to the server. This is used to get a connected client.
	 */
	public async getClient(): Promise<RedisClientConnectionType> {
		if (!this._client.isOpen) {
			await this._client.connect();
		}

		return this._client;
	}

	/**
	 * Set a key value pair in the store. TTL is in milliseconds.
	 * @param {string} key - the key to set
	 * @param {string} value - the value to set
	 * @param {number} [ttl] - the time to live in milliseconds
	 */
	public async set(key: string, value: string, ttl?: number): Promise<void> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		// eslint-disable-next-line unicorn/prefer-ternary
		if (ttl) {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			await client.set(key, value, {PX: ttl});
		} else {
			await client.set(key, value);
		}
	}

	/**
	 * Will set many key value pairs in the store. TTL is in milliseconds. This will be done as a single transaction.
	 * @param {Array<KeyvRedisEntry<string>>} entries - the key value pairs to set with optional ttl
	 */
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

	/**
	 * Check if a key exists in the store.
	 * @param {string} key - the key to check
	 * @returns {Promise<boolean>} - true if the key exists, false if not
	 */
	public async has(key: string): Promise<boolean> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		const exists = await client.exists(key);

		return exists === 1;
	}

	/**
	 * Check if many keys exist in the store. This will be done as a single transaction.
	 * @param {Array<string>} keys - the keys to check
	 * @returns {Promise<Array<boolean>>} - array of booleans for each key if it exists
	 */
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

	/**
	 * Get a value from the store. If the key does not exist, it will return undefined.
	 * @param {string} key - the key to get
	 * @returns {Promise<string | undefined>} - the value or undefined if the key does not exist
	 */
	public async get<T>(key: string): Promise<T | undefined> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		const value = await client.get(key);
		if (value === null) {
			return undefined;
		}

		return value as T;
	}

	/**
	 * Get many values from the store. If a key does not exist, it will return undefined.
	 * @param {Array<string>} keys - the keys to get
	 * @returns {Promise<Array<string | undefined>>} - array of values or undefined if the key does not exist
	 */
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

	/**
	 * Delete a key from the store.
	 * @param {string} key - the key to delete
	 * @returns {Promise<boolean>} - true if the key was deleted, false if not
	 */
	public async delete(key: string): Promise<boolean> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		let deleted = 0;
		deleted = await (this._useUnlink ? client.unlink(key) : client.del(key));

		return deleted > 0;
	}

	/**
	 * Delete many keys from the store. This will be done as a single transaction.
	 * @param {Array<string>} keys - the keys to delete
	 * @returns {Promise<boolean>} - true if any key was deleted, false if not
	 */
	public async deleteMany(keys: string[]): Promise<boolean> {
		let result = false;
		const client = await this.getClient();
		const multi = client.multi();
		for (const key of keys) {
			const prefixedKey = this.createKeyPrefix(key, this._namespace);
			if (this._useUnlink) {
				multi.unlink(prefixedKey);
			} else {
				multi.del(prefixedKey);
			}
		}

		const results = await multi.exec();

		for (const deleted of results) {
			if (typeof deleted === 'number' && deleted > 0) {
				result = true;
			}
		}

		return result;
	}

	/**
	 * Disconnect from the Redis server.
	 * @returns {Promise<void>}
	 */
	public async disconnect(): Promise<void> {
		if (this._client.isOpen) {
			await this._client.disconnect();
		}
	}

	/**
	 * Helper function to create a key with a namespace.
	 * @param {string} key - the key to prefix
	 * @param {string} namespace - the namespace to prefix the key with
	 * @returns {string} - the key with the namespace such as 'namespace::key'
	 */
	public createKeyPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return `${namespace}${this._keyPrefixSeparator}${key}`;
		}

		return key;
	}

	/**
	 * Helper function to get a key without the namespace.
	 * @param {string} key - the key to remove the namespace from
	 * @param {string} namespace - the namespace to remove from the key
	 * @returns {string} - the key without the namespace such as 'key'
	 */
	public getKeyWithoutPrefix(key: string, namespace?: string): string {
		if (namespace) {
			return key.replace(`${namespace}${this._keyPrefixSeparator}`, '');
		}

		return key;
	}

	/**
	 * Is the client a cluster.
	 * @returns {boolean} - true if the client is a cluster, false if not
	 */
	public isCluster(): boolean {
		return this.isClientCluster(this._client);
	}

	/**
	 * Get an async iterator for the keys and values in the store. If a namespace is provided, it will only iterate over keys with that namespace.
	 * @param {string} [namespace] - the namespace to iterate over
	 * @returns {AsyncGenerator<[string, T | undefined], void, unknown>} - async iterator with key value pairs
	 */
	public async * iterator<Value>(namespace?: string): AsyncGenerator<[string, Value | undefined], void, unknown> {
		if (this.isCluster()) {
			throw new Error('Iterating over keys in a cluster is not supported.');
		} else {
			yield * this.iteratorClient<Value>(namespace);
		}
	}

	/**
	 * Get an async iterator for the keys and values in the store. If a namespace is provided, it will only iterate over keys with that namespace.
	 * @param {string} [namespace] - the namespace to iterate over
	 * @returns {AsyncGenerator<[string, T | undefined], void, unknown>} - async iterator with key value pairs
	 */
	public async * iteratorClient<Value>(namespace?: string): AsyncGenerator<[string, Value | undefined], void, unknown> {
		const client = await this.getClient();
		const match = namespace ? `${namespace}${this._keyPrefixSeparator}*` : '*';
		let cursor = '0';
		do {
			// eslint-disable-next-line no-await-in-loop, @typescript-eslint/naming-convention
			const result = await (client as RedisClientType).scan(Number.parseInt(cursor, 10), {MATCH: match, TYPE: 'string'});
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

	/**
	 * Clear all keys in the store.
	 * IMPORTANT: this can cause performance issues if there are a large number of keys in the store and worse with clusters. Use with caution as not recommended for production.
	 * If a namespace is not set it will clear all keys with no prefix.
	 * If a namespace is set it will clear all keys with that namespace.
	 * @returns {Promise<void>}
	 */
	public async clear(): Promise<void> {
		await (this.isCluster() ? this.clearNamespaceCluster(this._namespace) : this.clearNamespace(this._namespace));
	}

	private async clearNamespace(namespace?: string): Promise<void> {
		try {
			let cursor = '0';
			const batchSize = this._clearBatchSize;
			const match = namespace ? `${namespace}${this._keyPrefixSeparator}*` : '*';
			const client = await this.getClient();

			do {
				// eslint-disable-next-line no-await-in-loop, @typescript-eslint/naming-convention
				const result = await (client as RedisClientType).scan(Number.parseInt(cursor, 10), {MATCH: match, COUNT: batchSize, TYPE: 'string'});

				cursor = result.cursor.toString();
				let {keys} = result;

				if (keys.length === 0) {
					continue;
				}

				if (!namespace) {
					keys = keys.filter(key => !key.includes(this._keyPrefixSeparator));
				}

				if (keys.length > 0) {
					// eslint-disable-next-line unicorn/prefer-ternary
					if (this._useUnlink) {
						// eslint-disable-next-line no-await-in-loop
						await client.unlink(keys);
					} else {
						// eslint-disable-next-line no-await-in-loop
						await client.del(keys);
					}
				}
			} while (cursor !== '0');
		/* c8 ignore next 3 */
		} catch (error) {
			this.emit('error', error);
		}
	}

	private async clearNamespaceCluster(namespace?: string): Promise<void> {
		throw new Error('Clearing all keys in a cluster is not supported.');
	}

	private isClientCluster(client: RedisClientConnectionType): boolean {
		if ((client as any).options === undefined && (client as any).scan === undefined) {
			return true;
		}

		return false;
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

		if (options.useUnlink !== undefined) {
			this._useUnlink = options.useUnlink;
		}
	}

	private initClient(): void {
		/* c8 ignore next 3 */
		this._client.on('error', error => {
			this.emit('error', error);
		});
	}
}

/**
 * Will create a Keyv instance with the Redis adapter. This will also set the namespace and useKeyPrefix to false.
 * @param connect
 * @param options
 * @returns {Keyv} - Keyv instance with the Redis adapter
 */
export function createKeyv(connect?: string | RedisClientOptions | RedisClientType, options?: KeyvRedisOptions): Keyv {
	const adapter = new KeyvRedis(connect, options);
	const keyv = new Keyv({store: adapter, namespace: options?.namespace, useKeyPrefix: false});
	return keyv;
}

export {
	createClient, createCluster, type RedisClientOptions, type RedisClientType, type RedisClusterType, type RedisClusterOptions,
} from 'redis';

export {
	Keyv,
} from 'keyv';
