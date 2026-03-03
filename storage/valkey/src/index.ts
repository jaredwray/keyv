import EventEmitter from "node:events";
import calculateSlot from "cluster-key-slot";
import Redis from "iovalkey";
import Keyv, { type KeyvStoreAdapter, type StoredData } from "keyv";
import type { KeyvUriOptions, KeyvValkeyOptions } from "./types.js";

class KeyvValkey extends EventEmitter implements KeyvStoreAdapter {
	/**
	 * The namespace used to prefix keys for multi-tenant separation.
	 * @default undefined
	 */
	private _namespace?: string;

	/**
	 * Whether to use sets for key management.
	 * When true, uses sets to track namespaced keys for cleaner management.
	 * When false, uses pattern matching instead.
	 * @default true
	 */
	private _useSets = false;

	/**
	 * The iovalkey Redis or Cluster instance.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	private _redis: any;

	constructor(
		uri: KeyvValkeyOptions | KeyvUriOptions,
		options?: KeyvValkeyOptions,
	) {
		super();

		if (
			typeof uri !== "string" &&
			"options" in uri &&
			uri.options &&
			("family" in uri.options || uri.isCluster)
		) {
			this._redis = uri;
		} else {
			options = {
				...(typeof uri === "string" ? { uri } : (uri as KeyvValkeyOptions)),
				...options,
			};
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			this._redis = new Redis(options.uri!, options);
		}

		if (options !== undefined && options.useSets !== undefined) {
			this._useSets = options.useSets;
		}

		this._redis.on("error", (error: Error) => this.emit("error", error));
	}

	/**
	 * Get the namespace for the adapter. If undefined, no namespace prefix is applied.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get whether sets are used for key management.
	 * @default true
	 */
	public get useSets(): boolean {
		return this._useSets;
	}

	/**
	 * Set whether sets are used for key management.
	 */
	public set useSets(value: boolean) {
		this._useSets = value;
	}

	/**
	 * @deprecated Use `useSets` instead.
	 */
	public get useRedisSets(): boolean {
		return this._useSets;
	}

	/**
	 * @deprecated Use `useSets` instead.
	 */
	public set useRedisSets(value: boolean) {
		this._useSets = value;
	}

	/**
	 * Get the iovalkey Redis or Cluster instance.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get redis(): any {
		return this._redis;
	}

	/**
	 * Set the iovalkey Redis or Cluster instance.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public set redis(value: any) {
		this._redis = value;
	}

	/**
	 * Get the options for the adapter. This is provided for backward compatibility.
	 */
	public get opts(): Record<string, unknown> {
		return {
			dialect: "redis",
			useSets: this._useSets,
		};
	}

	/**
	 * Returns true if the underlying client is a Cluster instance.
	 */
	private isCluster(): boolean {
		return this._redis.isCluster === true;
	}

	/**
	 * Groups keys by hash slot for cluster-safe transactions.
	 * In non-cluster mode, all keys go to slot 0.
	 */
	private getSlotMap(keys: string[]): Map<number, string[]> {
		const slotMap = new Map<number, string[]>();
		if (this.isCluster()) {
			for (const key of keys) {
				const slot = calculateSlot(key);
				const slotKeys = slotMap.get(slot) ?? [];
				slotKeys.push(key);
				slotMap.set(slot, slotKeys);
			}
		} else {
			slotMap.set(0, keys);
		}

		return slotMap;
	}

	getNamespace(): string {
		if (this.namespace) {
			return `namespace:${this.namespace}`;
		}

		return `namespace:`;
	}

	getKeyName = (key: string): string => {
		if (!this._useSets) {
			return `${this.getNamespace()}:${key}`;
		}

		return key;
	};

	async get<Value>(key: string): Promise<StoredData<Value> | undefined> {
		key = this.getKeyName(key);

		const value = await this._redis.get(key);
		if (value === null) {
			return undefined;
		}

		return value;
	}

	async getMany<Value>(
		keys: string[],
	): Promise<Array<StoredData<Value | undefined>>> {
		const resolvedKeys = keys.map(this.getKeyName);

		if (this.isCluster()) {
			const slotMap = this.getSlotMap(resolvedKeys);
			const resultMap = new Map<string, StoredData<Value | undefined>>();

			await Promise.all(
				Array.from(slotMap.values(), async (slotKeys) => {
					const values = await this._redis.mget(slotKeys);
					for (const [index, value] of values.entries()) {
						resultMap.set(slotKeys[index], value);
					}
				}),
			);

			return resolvedKeys.map(
				(k) => resultMap.get(k) as StoredData<Value | undefined>,
			);
		}

		return this._redis.mget(resolvedKeys);
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number) {
		if (value === undefined) {
			return undefined;
		}

		key = this.getKeyName(key);

		// biome-ignore lint/suspicious/noExplicitAny: type format
		const set = async (redis: any) => {
			if (typeof ttl === "number") {
				await redis.set(key, value, "PX", ttl);
			} else {
				await redis.set(key, value);
			}
		};

		if (this._useSets) {
			const trx = await this._redis.multi();
			await set(trx);
			await trx.sadd(this.getNamespace(), key);
			await trx.exec();
		} else {
			await set(this._redis);
		}
	}

	async setMany(
		// biome-ignore lint/suspicious/noExplicitAny: type format
		entries: Array<{ key: string; value: any; ttl?: number }>,
	): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		// biome-ignore lint/suspicious/noExplicitAny: type format
		const resolvedEntries: Array<{ k: string; value: any; ttl?: number }> = [];
		for (const { key, value, ttl } of entries) {
			if (value === undefined) {
				continue;
			}

			resolvedEntries.push({ k: this.getKeyName(key), value, ttl });
		}

		if (resolvedEntries.length === 0) {
			return;
		}

		const slotMap = new Map<number, typeof resolvedEntries>();
		if (this.isCluster()) {
			for (const entry of resolvedEntries) {
				const slot = calculateSlot(entry.k);
				const group = slotMap.get(slot) ?? [];
				group.push(entry);
				slotMap.set(slot, group);
			}
		} else {
			slotMap.set(0, resolvedEntries);
		}

		await Promise.all(
			Array.from(slotMap.values(), async (group) => {
				const trx = this._redis.multi();
				for (const { k, value, ttl } of group) {
					if (typeof ttl === "number") {
						trx.set(k, value, "PX", ttl);
					} else {
						trx.set(k, value);
					}

					if (this._useSets) {
						trx.sadd(this.getNamespace(), k);
					}
				}

				await trx.exec();
			}),
		);
	}

	async delete(key: string) {
		key = this.getKeyName(key);
		let items = 0;
		// biome-ignore lint/suspicious/noExplicitAny: allowed
		const unlink = async (redis: any) => redis.unlink(key);

		if (this._useSets) {
			const trx = this._redis.multi();
			await unlink(trx);
			await trx.srem(this.getNamespace(), key);
			const r = await trx.exec();
			items = r[0][1];
		} else {
			items = await unlink(this._redis);
		}

		return items > 0;
	}

	async deleteMany(keys: string[]) {
		if (keys.length === 0) {
			return false;
		}

		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		const slotMap = this.getSlotMap(resolvedKeys);
		let deleted = false;

		await Promise.all(
			Array.from(slotMap.values(), async (slotKeys) => {
				const trx = this._redis.multi();
				for (const k of slotKeys) {
					trx.unlink(k);
					if (this._useSets) {
						trx.srem(this.getNamespace(), k);
					}
				}

				const results = await trx.exec();
				const step = this._useSets ? 2 : 1;
				// biome-ignore lint/suspicious/noExplicitAny: type format
				if (results.some((r: any, i: number) => i % step === 0 && r[1] > 0)) {
					deleted = true;
				}
			}),
		);

		return deleted;
	}

	async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		const resultMap = new Map<string, boolean>();
		const slotMap = this.getSlotMap(resolvedKeys);

		await Promise.all(
			Array.from(slotMap.entries(), async ([_slot, slotKeys]) => {
				const trx = this._redis.multi();
				for (const k of slotKeys) {
					trx.exists(k);
				}

				const results = await trx.exec();
				for (const [index, result] of results.entries()) {
					// biome-ignore lint/suspicious/noExplicitAny: type format
					const r = result as any;
					resultMap.set(slotKeys[index], r[0] === null && r[1] > 0);
				}
			}),
		);

		return resolvedKeys.map((k) => resultMap.get(k) ?? false);
	}

	async clear() {
		if (this._useSets) {
			const keys: string[] = await this._redis.smembers(this.getNamespace());
			if (keys.length > 0) {
				await Promise.all([
					this._redis.unlink([...keys]),
					this._redis.srem(this.getNamespace(), [...keys]),
				]);
			}
		} else {
			const pattern = `${this.getNamespace()}*`;
			const keys: string[] = await this._redis.keys(pattern);
			if (keys.length > 0) {
				await this._redis.unlink(keys);
			}
		}
	}

	async *iterator(namespace?: string) {
		const scan = this._redis.scan.bind(this._redis);
		const get = this._redis.mget.bind(this._redis);
		const prefix = this._useSets ? "" : `${this.getNamespace()}:`;
		const match = `${prefix}${namespace ?? ""}:*`;
		let cursor = "0";
		do {
			const [curs, keys] = await scan(cursor, "MATCH", match);
			cursor = curs;
			if (keys.length > 0) {
				const values = await get(keys);
				for (const [i] of keys.entries()) {
					const key = prefix ? keys[i].slice(prefix.length) : keys[i];
					const value = values[i];
					yield [key, value];
				}
			}
		} while (cursor !== "0");
	}

	async has(key: string) {
		key = this.getKeyName(key);
		const value: number = await this._redis.exists(key);
		return value !== 0;
	}

	async disconnect() {
		return this._redis.disconnect();
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
