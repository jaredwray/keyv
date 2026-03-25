import calculateSlot from "cluster-key-slot";
import { Hookified } from "hookified";
import Redis, { type Cluster } from "iovalkey";
import Keyv, { type KeyvStorageAdapter, type StoredData } from "keyv";
import type { KeyvUriOptions, KeyvValkeyOptions } from "./types.js";

/**
 * Valkey storage adapter for Keyv. Supports both standalone and cluster modes
 * using iovalkey as the underlying client. Implements the {@link KeyvStorageAdapter}
 * interface with support for namespacing, TTL, batch operations, and async iteration.
 */
class KeyvValkey extends Hookified implements KeyvStorageAdapter {
	/**
	 * The namespace used to prefix keys for multi-tenant separation.
	 * When set, all keys are scoped under this namespace to prevent collisions
	 * between different consumers sharing the same Valkey instance.
	 * @default undefined
	 */
	private _namespace?: string;

	/**
	 * Whether to use Redis/Valkey sets for tracking namespaced keys.
	 * When true, keys are tracked in a set for efficient `clear()` operations.
	 * When false, `clear()` uses pattern-based key scanning with `KEYS` command.
	 * @default false
	 */
	private _useSets = false;

	/**
	 * The underlying iovalkey Redis or Cluster client instance used for all
	 * storage operations. Can be a standalone Redis connection or a Cluster instance.
	 * Typed as `any` internally to avoid cascading type assertions from iovalkey's
	 * return types. The public `client` getter/setter exposes the proper `Redis | Cluster` type.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: iovalkey method return types require flexible internal typing
	private _client: any;

	/**
	 * Creates a new KeyvValkey adapter instance.
	 *
	 * Accepts either a connection URI string, a pre-configured iovalkey Redis/Cluster instance,
	 * or a configuration object. When a URI string is provided, a new Redis connection is created.
	 * When an existing Redis/Cluster instance is passed, it is reused directly.
	 *
	 * @param {KeyvValkeyOptions | KeyvUriOptions} uri - Connection URI string (e.g. `"redis://localhost:6379"`),
	 *   a pre-configured iovalkey Redis/Cluster instance, or an options object.
	 * @param {KeyvValkeyOptions} [options] - Additional adapter options such as `useSets`. Merged with
	 *   options derived from `uri` when `uri` is a string or plain options object.
	 */
	constructor(
		uri: KeyvValkeyOptions | KeyvUriOptions,
		options?: KeyvValkeyOptions,
	) {
		super({ throwOnEmptyListeners: false });

		if (
			typeof uri !== "string" &&
			"options" in uri &&
			uri.options &&
			("family" in uri.options || uri.isCluster)
		) {
			this._client = uri;
		} else {
			options = {
				...(typeof uri === "string" ? { uri } : (uri as KeyvValkeyOptions)),
				...options,
			};
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			this._client = new Redis(options.uri!, options);
		}

		if (options !== undefined && options.useSets !== undefined) {
			this._useSets = options.useSets;
		}

		this._client.on("error", (error: Error) => this.emit("error", error));
	}

	/**
	 * Gets the namespace for the adapter. When set, all keys are prefixed with
	 * this namespace to provide multi-tenant isolation within a shared Valkey instance.
	 * @returns {string | undefined} The current namespace, or `undefined` if no namespace is set.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Sets the namespace for the adapter. Used for key prefixing and scoping
	 * operations like `clear()`, `iterator()`, and set-based key tracking.
	 * @param {string | undefined} value - The namespace string to use, or `undefined` to remove namespacing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Gets whether Valkey sets are used for key management. When enabled, keys are tracked
	 * in a Valkey set per namespace, allowing `clear()` to efficiently remove only the keys
	 * belonging to that namespace without scanning.
	 * @returns {boolean} `true` if set-based key tracking is enabled, `false` otherwise.
	 * @default false
	 */
	public get useSets(): boolean {
		return this._useSets;
	}

	/**
	 * Sets whether Valkey sets are used for key management.
	 * @param {boolean} value - `true` to enable set-based key tracking, `false` to use pattern scanning.
	 */
	public set useSets(value: boolean) {
		this._useSets = value;
	}

	/**
	 * Gets whether Redis sets are used for key management.
	 * @returns {boolean} `true` if set-based key tracking is enabled, `false` otherwise.
	 * @deprecated Use {@link useSets} instead.
	 */
	public get useRedisSets(): boolean {
		return this._useSets;
	}

	/**
	 * Sets whether Redis sets are used for key management.
	 * @param {boolean} value - `true` to enable set-based key tracking, `false` to use pattern scanning.
	 * @deprecated Use {@link useSets} instead.
	 */
	public set useRedisSets(value: boolean) {
		this._useSets = value;
	}

	/**
	 * Gets the underlying iovalkey Redis or Cluster client instance.
	 * Can be used to access the raw client for advanced operations not exposed by the adapter.
	 * @returns {Redis | Cluster} The iovalkey Redis or Cluster instance.
	 */
	public get client(): Redis | Cluster {
		return this._client as Redis | Cluster;
	}

	/**
	 * Replaces the underlying iovalkey Redis or Cluster client instance.
	 * @param {Redis | Cluster} value - The new iovalkey Redis or Cluster instance to use.
	 */
	public set client(value: Redis | Cluster) {
		this._client = value;
	}

	/**
	 * Gets the adapter options for backward compatibility with Keyv internals.
	 * Returns the dialect identifier and current `useSets` setting.
	 * @returns {{ dialect: string; useSets: boolean }} The adapter options object.
	 */
	public get opts(): Record<string, unknown> {
		return {
			dialect: "redis",
			useSets: this._useSets,
		};
	}

	/**
	 * Retrieves the value associated with a key from the Valkey store.
	 * The key is resolved through the namespace prefix before querying.
	 * @template Value - The type of the stored value.
	 * @param {string} key - The key to look up.
	 * @returns {Promise<StoredData<Value> | undefined>} The stored data if found, or `undefined` if the key does not exist.
	 */
	public async get<Value>(key: string): Promise<StoredData<Value> | undefined> {
		key = this.getKeyName(key);

		const value = await this._client.get(key);
		if (value === null) {
			return undefined;
		}

		return value;
	}

	/**
	 * Retrieves the values associated with multiple keys from the Valkey store in a single operation.
	 * In cluster mode, keys are grouped by hash slot to avoid CROSSSLOT errors and each group
	 * is fetched with a separate `MGET` command. In standalone mode, a single `MGET` is used.
	 * @template Value - The type of the stored values.
	 * @param {string[]} keys - An array of keys to look up.
	 * @returns {Promise<Array<StoredData<Value | undefined>>>} An array of stored data in the same order as the input keys.
	 *   Each element is the stored value or `undefined` if the corresponding key does not exist.
	 */
	public async getMany<Value>(
		keys: string[],
	): Promise<Array<StoredData<Value | undefined>>> {
		const resolvedKeys = keys.map((key) => this.getKeyName(key));

		if (this.isCluster()) {
			const slotMap = this.getSlotMap(resolvedKeys);
			const resultMap = new Map<string, StoredData<Value | undefined>>();

			await Promise.all(
				Array.from(slotMap.values(), async (slotKeys) => {
					const values = await this._client.mget(slotKeys);
					for (const [index, value] of values.entries()) {
						resultMap.set(slotKeys[index], value);
					}
				}),
			);

			return resolvedKeys.map(
				(k) => resultMap.get(k) as StoredData<Value | undefined>,
			);
		}

		return this._client.mget(resolvedKeys);
	}

	/**
	 * Stores a key-value pair in the Valkey store with an optional TTL (time-to-live).
	 * If the value is `undefined`, the operation is skipped and returns `undefined`.
	 * When `useSets` is enabled, the key is also added to the namespace tracking set
	 * within an atomic transaction.
	 * @param {string} key - The key under which to store the value.
	 * @param {any} value - The value to store. If `undefined`, the operation is a no-op.
	 * @param {number} [ttl] - Optional time-to-live in milliseconds. When provided, the key
	 *   will automatically expire after this duration.
	 * @returns {Promise<undefined>} Returns `undefined` if the value is `undefined`.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public async set(key: string, value: any, ttl?: number) {
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
			const trx = await this._client.multi();
			await set(trx);
			await trx.sadd(this.getSetKey(), key);
			await trx.exec();
		} else {
			await set(this._client);
		}
	}

	/**
	 * Stores multiple key-value pairs in the Valkey store in a single batched operation.
	 * Entries with `undefined` values are skipped. In cluster mode, entries are grouped by
	 * hash slot and each group is executed as a separate `MULTI/EXEC` transaction to avoid
	 * CROSSSLOT errors. When `useSets` is enabled, each key is also added to the namespace
	 * tracking set within the same transaction.
	 * @param {Array<{ key: string; value: any; ttl?: number }>} entries - An array of objects
	 *   containing `key`, `value`, and an optional `ttl` in milliseconds for each entry.
	 * @returns {Promise<void>}
	 */
	public async setMany(
		// biome-ignore lint/suspicious/noExplicitAny: type format
		entries: Array<{ key: string; value: any; ttl?: number }>,
	): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return entries.map(() => true);
		}

		const results = new Array<boolean>(entries.length).fill(false);

		const resolvedEntries: Array<{
			k: string;
			// biome-ignore lint/suspicious/noExplicitAny: type format
			value: any;
			ttl?: number;
			originalIndex: number;
		}> = [];
		for (let i = 0; i < entries.length; i++) {
			const { key, value, ttl } = entries[i];
			if (value === undefined) {
				results[i] = true;
				continue;
			}

			resolvedEntries.push({
				k: this.getKeyName(key),
				value,
				ttl,
				originalIndex: i,
			});
		}

		if (resolvedEntries.length === 0) {
			return results;
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

		try {
			await Promise.all(
				Array.from(slotMap.values(), async (group) => {
					const trx = this._client.multi();
					for (const { k, value, ttl } of group) {
						if (typeof ttl === "number") {
							trx.set(k, value, "PX", ttl);
						} else {
							trx.set(k, value);
						}

						if (this._useSets) {
							trx.sadd(this.getSetKey(), k);
						}
					}

					const execResults = await trx.exec();
					/* v8 ignore next -- @preserve */
					if (execResults) {
						const step = this._useSets ? 2 : 1;
						for (let j = 0; j < group.length; j++) {
							const result = execResults[j * step];
							// ioredis exec returns [error, reply] tuples
							/* v8 ignore next -- @preserve */
							const success = Array.isArray(result)
								? result[0] === null && result[1] === "OK"
								: result === "OK";
							results[group[j].originalIndex] = success;
						}
					}
				}),
			);
		} catch (error) {
			this.emit("error", error);
		}

		return results;
	}

	/**
	 * Deletes a single key from the Valkey store. Uses `UNLINK` for non-blocking removal.
	 * When `useSets` is enabled, the key is also removed from the namespace tracking set
	 * within an atomic transaction.
	 * @param {string} key - The key to delete.
	 * @returns {Promise<boolean>} `true` if the key existed and was deleted, `false` if the key did not exist.
	 */
	public async delete(key: string) {
		key = this.getKeyName(key);
		let items = 0;
		// biome-ignore lint/suspicious/noExplicitAny: allowed
		const unlink = async (redis: any) => redis.unlink(key);

		if (this._useSets) {
			const trx = this._client.multi();
			await unlink(trx);
			await trx.srem(this.getSetKey(), key);
			const r = await trx.exec();
			items = r[0][1];
		} else {
			items = await unlink(this._client);
		}

		return items > 0;
	}

	/**
	 * Deletes multiple keys from the Valkey store by deleting each key individually.
	 * Each element in the returned array indicates whether that specific key was
	 * successfully deleted.
	 * @param {string[]} keys - An array of keys to delete.
	 * @returns {Promise<boolean[]>} An array of booleans in the same order as the input keys.
	 *   Each element is `true` if the corresponding key existed and was deleted, `false` otherwise.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		return Promise.all(keys.map(async (key) => this.delete(key)));
	}

	/**
	 * Checks whether multiple keys exist in the Valkey store in a single batched operation.
	 * In cluster mode, keys are grouped by hash slot and each group is checked using
	 * a separate `MULTI/EXEC` transaction with `EXISTS` commands to avoid CROSSSLOT errors.
	 * @param {string[]} keys - An array of keys to check for existence.
	 * @returns {Promise<boolean[]>} An array of booleans in the same order as the input keys.
	 *   Each element is `true` if the corresponding key exists, `false` otherwise.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const resolvedKeys = keys.map((key) => this.getKeyName(key));
		const resultMap = new Map<string, boolean>();
		const slotMap = this.getSlotMap(resolvedKeys);

		await Promise.all(
			Array.from(slotMap.entries(), async ([_slot, slotKeys]) => {
				const trx = this._client.multi();
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

	/**
	 * Removes all keys belonging to the current namespace from the Valkey store.
	 * When `useSets` is enabled, retrieves all tracked keys from the namespace set
	 * and removes them along with the set itself using `UNLINK` and `SREM`.
	 * When `useSets` is disabled, uses the `KEYS` command with a pattern match
	 * to find and remove all keys matching the namespace prefix.
	 * @returns {Promise<void>}
	 */
	public async clear() {
		if (this._useSets) {
			const setKey = this.getSetKey();
			const keys: string[] = await this._client.smembers(setKey);
			if (keys.length > 0) {
				await Promise.all([
					this._client.unlink([...keys]),
					this._client.srem(setKey, [...keys]),
				]);
			}

			// Legacy cleanup: clear old "namespace:<ns>" SET key from pre-v6 format
			if (this.namespace) {
				const legacySetKey = `namespace:${this.namespace}`;
				const legacyKeyType: string = await this._client.type(legacySetKey);
				if (legacyKeyType === "set") {
					const legacyKeys: string[] =
						await this._client.smembers(legacySetKey);
					if (legacyKeys.length > 0) {
						await Promise.all([
							this._client.unlink([...legacyKeys]),
							this._client.srem(legacySetKey, [...legacyKeys]),
						]);
					}

					await this._client.unlink(legacySetKey);
				}
			}
		} else {
			const prefix = this.getKeyPrefix();
			const pattern = prefix ? `${prefix}*` : "*";
			const keys: string[] = await this._client.keys(pattern);
			if (keys.length > 0) {
				await this._client.unlink(keys);
			}
		}
	}

	/**
	 * Creates an async generator that iterates over all key-value pairs matching
	 * the given namespace. Uses the `SCAN` command for cursor-based iteration to
	 * avoid blocking the server. Values are fetched in batches using `MGET`.
	 * @param {string} [namespace] - The namespace to iterate over. If not provided,
	 *   iterates over keys matching the empty namespace prefix.
	 * @yields {[string, string]} A tuple of `[key, value]` for each matching entry.
	 *   The key has the internal namespace prefix stripped when `useSets` is disabled.
	 */
	public async *iterator() {
		const scan = this._client.scan.bind(this._client);
		const get = this._client.mget.bind(this._client);
		const prefix = `${this.getKeyPrefix()}:`;
		const match = `${prefix}*`;
		let cursor = "0";
		do {
			const [curs, keys] = await scan(cursor, "MATCH", match);
			cursor = curs;
			if (keys.length > 0) {
				const values = await get(keys);
				for (const [i] of keys.entries()) {
					const key = keys[i].slice(prefix.length);
					const value = values[i];
					yield [key, value];
				}
			}
		} while (cursor !== "0");
	}

	/**
	 * Checks whether a key exists in the Valkey store.
	 * @param {string} key - The key to check for existence.
	 * @returns {Promise<boolean>} `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string) {
		key = this.getKeyName(key);
		const value: number = await this._client.exists(key);
		return value !== 0;
	}

	/**
	 * Disconnects the underlying iovalkey client from the Valkey server.
	 * After calling this method, the adapter can no longer perform operations
	 * and any subsequent calls will throw an error.
	 * @returns {Promise<void>}
	 */
	public async disconnect() {
		return this._client.disconnect();
	}

	/**
	 * Returns the key used for the Valkey SET that tracks all data keys in this namespace.
	 * Only used when `useSets` is enabled. The `sets:` prefix ensures this SET key
	 * never collides with data keys from other adapters or non-useSets configurations.
	 * @returns {string} The SET tracking key (e.g. `"sets:myns"` or `"sets"` when no namespace).
	 */
	private getSetKey(): string {
		if (this.namespace) {
			return `sets:${this.namespace}`;
		}

		return "sets";
	}

	/**
	 * Returns the key prefix used for scoping data keys. When `useSets` is enabled,
	 * keys use the `sets:` prefix to isolate them from non-useSets keys. When disabled
	 * and a namespace is set, keys use the `namespace:` prefix. When no namespace is
	 * set and `useSets` is disabled, keys are stored without a prefix.
	 * @returns {string} The key prefix, or empty string if no namespace and useSets is disabled.
	 */
	private getKeyPrefix(): string {
		if (this._useSets) {
			if (this.namespace) {
				return `sets:${this.namespace}`;
			}

			return "sets";
		}

		if (this.namespace) {
			return `namespace:${this.namespace}`;
		}

		return "";
	}

	/**
	 * Resolves a logical key to its fully qualified storage key by prefixing it
	 * with the appropriate prefix (e.g. `"sets:myns:mykey"` or `"namespace:myns:mykey"`).
	 * When no prefix is configured, returns the key as-is.
	 * @param {string} key - The logical key to resolve.
	 * @returns {string} The fully qualified key for use in Valkey commands.
	 */
	private getKeyName(key: string): string {
		const prefix = this.getKeyPrefix();
		if (prefix) {
			return `${prefix}:${key}`;
		}

		return key;
	}

	/**
	 * Checks whether the underlying iovalkey client is a Cluster instance.
	 * Used internally to determine whether operations need cluster-safe handling
	 * such as hash slot grouping for multi-key commands.
	 * @returns {boolean} `true` if the client is a Cluster instance, `false` for standalone.
	 */
	private isCluster(): boolean {
		return this._client.isCluster === true;
	}

	/**
	 * Groups an array of keys by their Redis hash slot for cluster-safe multi-key operations.
	 * In cluster mode, keys that map to different hash slots cannot be used in the same
	 * `MULTI/EXEC` transaction, so they must be grouped and processed separately.
	 * In standalone (non-cluster) mode, all keys are assigned to slot 0 for a single batch.
	 * @param {string[]} keys - The keys to group by hash slot.
	 * @returns {Map<number, string[]>} A map from hash slot number to the array of keys in that slot.
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
}

/**
 * Creates a new {@link Keyv} instance pre-configured with the Valkey storage adapter.
 * This is a convenience factory function that handles adapter instantiation and wiring.
 * @param {KeyvValkeyOptions | KeyvUriOptions} [connect="redis://localhost:6379"] - Connection configuration.
 *   Can be a Redis URI string (e.g. `"redis://localhost:6379"`) or an options object with
 *   connection details and adapter settings.
 * @param {KeyvValkeyOptions} [options] - Additional adapter options such as `useSets` and `namespace`.
 * @returns {Keyv} A fully configured Keyv instance backed by the Valkey adapter.
 * @example
 * ```typescript
 * const keyv = createKeyv("redis://localhost:6379");
 * await keyv.set("greeting", "hello");
 * console.log(await keyv.get("greeting")); // "hello"
 * ```
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
