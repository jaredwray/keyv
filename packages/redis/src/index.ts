import EventEmitter from 'node:events';
import {
	createClient, createCluster, type RedisClientType, type RedisClientOptions, type RedisClusterType,
	type RedisClusterOptions,
	type RedisModules,
	type RedisFunctions,
	type RedisScripts,
} from '@redis/client';
import {Keyv, type KeyvStoreAdapter, type KeyvEntry} from 'keyv';
import calculateSlot from 'cluster-key-slot';

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

	/**
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * Defaults to `false`.
	 */
	noNamespaceAffectsAll?: boolean;
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
export default class KeyvRedis<T> extends EventEmitter implements KeyvStoreAdapter {
	private _client: RedisClientConnectionType = createClient() as RedisClientType;
	private _namespace: string | undefined;
	private _keyPrefixSeparator = '::';
	private _clearBatchSize = 1000;
	private _useUnlink = true;
	private _noNamespaceAffectsAll = false;

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
				// eslint-disable-next-line @stylistic/max-len
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
		let url = 'redis://localhost:6379';
		if ((this._client as RedisClientType).options) {
			const redisUrl = (this._client as RedisClientType).options?.url;
			if (redisUrl) {
				url = redisUrl;
			}
		}

		const results: KeyvRedisPropertyOptions = {
			namespace: this._namespace,
			keyPrefixSeparator: this._keyPrefixSeparator,
			clearBatchSize: this._clearBatchSize,
			noNamespaceAffectsAll: this._noNamespaceAffectsAll,
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
		if (value > 0) {
			this._clearBatchSize = value;
		} else {
			this.emit('error', 'clearBatchSize must be greater than 0');
		}
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
	 * Get if no namespace affects all keys.
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * @default false
	 */
	public get noNamespaceAffectsAll(): boolean {
		return this._noNamespaceAffectsAll;
	}

	/**
	 * Set if not namespace affects all keys.
	 */
	public set noNamespaceAffectsAll(value: boolean) {
		this._noNamespaceAffectsAll = value;
	}

	/**
	 * Get the Redis URL used to connect to the server. This is used to get a connected client.
	 */
	public async getClient(): Promise<RedisClientConnectionType> {
		try {
			if (!this._client.isOpen) {
				await this._client.connect();
			}
		/* c8 ignore next 3 */
		} catch (error) {
			this.emit('error', error);
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
	 * @param {KeyvEntry[]} entries - the key value pairs to set with optional ttl
	 */
	public async setMany(entries: KeyvEntry[]): Promise<void> {
		const client = await this.getClient();
		const multi = client.multi();
		for (const {key, value, ttl} of entries) {
			const prefixedKey = this.createKeyPrefix(key, this._namespace);
			if (ttl) {
				// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unsafe-argument
				multi.set(prefixedKey, value, {PX: ttl});
			} else {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
	public async get<U = T>(key: string): Promise<U | undefined> {
		const client = await this.getClient();
		key = this.createKeyPrefix(key, this._namespace);
		const value = await client.get(key);
		if (value === null) {
			return undefined;
		}

		return value as U;
	}

	/**
	 * Get many values from the store. If a key does not exist, it will return undefined.
	 * @param {Array<string>} keys - the keys to get
	 * @returns {Promise<Array<string | undefined>>} - array of values or undefined if the key does not exist
	 */
	public async getMany<U = T>(keys: string[]): Promise<Array<U | undefined>> {
		if (keys.length === 0) {
			return [];
		}

		keys = keys.map(key => this.createKeyPrefix(key, this._namespace));
		const values = await this.mget<U>(keys);

		return values;
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
	 * @param {boolean} [force] - it will send a quit command if false, otherwise it will send a disconnect command to forcefully disconnect.
	 * @see {@link https://github.com/redis/node-redis/tree/master/packages/redis#disconnecting}
	 */
	public async disconnect(force?: boolean): Promise<void> {
		if (this._client.isOpen) {
			await (force ? this._client.disconnect() : this._client.quit());
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
	 * Get the master nodes in the cluster. If not a cluster, it will return the single client.
	 *
	 * @returns {Promise<RedisClientType[]>} - array of master nodes
	 */
	public async getMasterNodes(): Promise<RedisClientType[]> {
		if (this.isCluster()) {
			const cluster = await this.getClient() as RedisClusterType;
			return Promise.all(cluster.masters.map(async main => cluster.nodeClient(main)));
		}

		return [await this.getClient() as RedisClientType];
	}

	/**
	 * Get an async iterator for the keys and values in the store. If a namespace is provided, it will only iterate over keys with that namespace.
	 * @param {string} [namespace] - the namespace to iterate over
	 * @returns {AsyncGenerator<[string, T | undefined], void, unknown>} - async iterator with key value pairs
	 */
	public async * iterator<U = T>(namespace?: string): AsyncGenerator<[string, U | undefined], void, unknown> {
		// When instance is not a cluster, it will only have one client
		const clients = await this.getMasterNodes();

		for (const client of clients) {
			const match = namespace ? `${namespace}${this._keyPrefixSeparator}*` : '*';
			let cursor = '0';
			do {
				// eslint-disable-next-line no-await-in-loop, @typescript-eslint/naming-convention
				const result = await client.scan(Number.parseInt(cursor, 10), {MATCH: match, TYPE: 'string'});
				cursor = result.cursor.toString();
				let {keys} = result;

				if (!namespace && !this._noNamespaceAffectsAll) {
					keys = keys.filter(key => !key.includes(this._keyPrefixSeparator));
				}

				if (keys.length > 0) {
					// eslint-disable-next-line no-await-in-loop
					const values = await this.mget<U>(keys);
					for (const i of keys.keys()) {
						const key = this.getKeyWithoutPrefix(keys[i], namespace);
						const value = values[i];
						yield [key, value];
					}
				}
			} while (cursor !== '0');
		}
	}

	/**
	 * Clear all keys in the store.
	 * IMPORTANT: this can cause performance issues if there are a large number of keys in the store and worse with clusters. Use with caution as not recommended for production.
	 * If a namespace is not set it will clear all keys with no prefix.
	 * If a namespace is set it will clear all keys with that namespace.
	 * @returns {Promise<void>}
	 */
	public async clear(): Promise<void> {
		try {
			// When instance is not a cluster, it will only have one client
			const clients = await this.getMasterNodes();

			await Promise.all(clients.map(async client => {
				if (!this._namespace && this._noNamespaceAffectsAll) {
					await client.flushDb();
					return;
				}

				let cursor = '0';
				const batchSize = this._clearBatchSize;
				const match = this._namespace ? `${this._namespace}${this._keyPrefixSeparator}*` : '*';
				const deletePromises = [];

				do {
					// eslint-disable-next-line no-await-in-loop, @typescript-eslint/naming-convention
					const result = await client.scan(Number.parseInt(cursor, 10), {MATCH: match, COUNT: batchSize, TYPE: 'string'});

					cursor = result.cursor.toString();
					let {keys} = result;

					if (keys.length === 0) {
						continue;
					}

					if (!this._namespace) {
						keys = keys.filter(key => !key.includes(this._keyPrefixSeparator));
					}

					deletePromises.push(this.clearWithClusterSupport(keys));
				} while (cursor !== '0');

				await Promise.all(deletePromises);
			}));
		/* c8 ignore next 3 */
		} catch (error) {
			this.emit('error', error);
		}
	}

	/**
	 * Get many keys. If the instance is a cluster, it will do multiple MGET calls
	 * by separating the keys by slot to solve the CROSS-SLOT restriction.
	 */
	private async mget<T = any>(keys: string[]): Promise<Array<T | undefined>> {
		const slotMap = this.getSlotMap(keys);

		const valueMap = new Map<string, string | undefined>();
		await Promise.all(Array.from(slotMap.entries(), async ([slot, keys]) => {
			const client = await this.getSlotMaster(slot);

			const values = await client.mGet(keys);
			for (const [index, value] of values.entries()) {
				valueMap.set(keys[index], value ?? undefined);
			}
		}));

		return keys.map(key => valueMap.get(key) as T | undefined);
	}

	/**
	 * Clear all keys in the store with a specific namespace. If the instance is a cluster, it will clear all keys
	 * by separating the keys by slot to solve the CROSS-SLOT restriction.
	 */
	private async clearWithClusterSupport(keys: string[]): Promise<void> {
		if (keys.length > 0) {
			const slotMap = this.getSlotMap(keys);

			await Promise.all(Array.from(slotMap.entries(), async ([slot, keys]) => {
				const client = await this.getSlotMaster(slot);

				return this._useUnlink ? client.unlink(keys) : client.del(keys);
			}));
		}
	}

	/**
	 * Returns the master node client for a given slot or the instance's client if it's not a cluster.
	 */
	private async getSlotMaster(slot: number): Promise<RedisClientType> {
		const connection = await this.getClient();

		if (this.isCluster()) {
			const cluster = connection as RedisClusterType;
			const mainNode = cluster.slots[slot].master;
			return cluster.nodeClient(mainNode);
		}

		return connection as RedisClientType;
	}

	/**
	 * Group keys by their slot.
	 *
	 * @param {string[]} keys - the keys to group
	 * @returns {Map<number, string[]>} - map of slot to keys
	 */
	private getSlotMap(keys: string[]) {
		const slotMap = new Map<number, string[]>();
		if (this.isCluster()) {
			for (const key of keys) {
				const slot = calculateSlot(key);
				const slotKeys = slotMap.get(slot) ?? [];
				slotKeys.push(key);
				slotMap.set(slot, slotKeys);
			}
		} else {
			// Non-clustered client supports CROSS-SLOT multi-key command so we set arbitrary slot 0
			slotMap.set(0, keys);
		}

		return slotMap;
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

		if (options.keyPrefixSeparator !== undefined) {
			this._keyPrefixSeparator = options.keyPrefixSeparator;
		}

		if (options.clearBatchSize !== undefined && options.clearBatchSize > 0) {
			this._clearBatchSize = options.clearBatchSize;
		}

		if (options.useUnlink !== undefined) {
			this._useUnlink = options.useUnlink;
		}

		if (options.noNamespaceAffectsAll !== undefined) {
			this._noNamespaceAffectsAll = options.noNamespaceAffectsAll;
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
 * @param connect - How to connect to the Redis server. If string pass in the url, if object pass in the options, if RedisClient pass in the client. If nothing is passed in, it will default to 'redis://localhost:6379'.
 * @param {KeyvRedisOptions} options - Options for the adapter such as namespace, keyPrefixSeparator, and clearBatchSize.
 * @returns {Keyv} - Keyv instance with the Redis adapter
 */
export function createKeyv(connect?: string | RedisClientOptions | RedisClientType, options?: KeyvRedisOptions): Keyv {
	connect ??= 'redis://localhost:6379';
	const adapter = new KeyvRedis(connect, options);
	const keyv = new Keyv({store: adapter, namespace: options?.namespace, useKeyPrefix: false});
	return keyv;
}

export {
	createClient, createCluster, type RedisClientOptions, type RedisClientType, type RedisClusterType, type RedisClusterOptions,
} from '@redis/client';

export {
	Keyv,
} from 'keyv';
