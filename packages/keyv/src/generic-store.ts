// biome-ignore-all lint/suspicious/noExplicitAny: map type
import EventManager from "./event-manager.js";
import {
	Keyv,
	type KeyvEntry,
	type KeyvStoreAdapter,
	type StoredData,
} from "./index.js";

export type KeyvGenericStoreOptions = {
	namespace?: string | (() => string);
	keySeparator?: string;
};

export type KeyvMapType = {
	get: (key: string) => any;
	set: (key: string, value: any, ttl?: number) => void;
	delete: (key: string) => boolean;
	clear: () => void;
	has: (key: string) => boolean;
};

export type CacheItem = {
	key: string;
	value: any;
	ttl?: number;
};

export type CacheItemStore = {
	key: string;
	value: any;
	expires?: number;
};

export type KeyPrefixData = {
	namespace?: string;
	key: string;
};

export class KeyvGenericStore extends EventManager implements KeyvStoreAdapter {
	private readonly _options?: KeyvGenericStoreOptions;
	private _store: Map<any, any> | KeyvMapType;
	private _namespace?: string | (() => string);
	private _keySeparator = "::";

	constructor(
		store: Map<any, any> | KeyvMapType,
		options?: KeyvGenericStoreOptions,
	) {
		super();
		this._store = store;
		this._options = options;

		if (options?.keySeparator) {
			this._keySeparator = options.keySeparator;
		}

		if (options?.namespace) {
			this._namespace = options?.namespace;
		}
	}

	public get store() {
		return this._store;
	}

	public set store(store: Map<any, any> | KeyvMapType) {
		this._store = store;
	}

	public get keySeparator() {
		return this._keySeparator;
	}

	public set keySeparator(separator: string) {
		this._keySeparator = separator;
	}

	public get opts() {
		return this._options;
	}

	public get namespace(): string | undefined {
		return this.getNamespace();
	}

	public set namespace(namespace: string | undefined) {
		this._namespace = namespace;
	}

	public getNamespace() {
		if (typeof this._namespace === "function") {
			return this._namespace();
		}

		return this._namespace;
	}

	public setNamespace(namespace: string | (() => string) | undefined) {
		this._namespace = namespace;
	}

	public getKeyPrefix(key: string, namespace?: string) {
		if (namespace) {
			return `${namespace}${this._keySeparator}${key}`;
		}

		return key;
	}

	public getKeyPrefixData(key: string) {
		if (key.includes(this._keySeparator)) {
			const [namespace, ...rest] = key.split(this._keySeparator);
			return { namespace, key: rest.join(this._keySeparator) };
		}

		return { key };
	}

	async get<T>(key: string): Promise<StoredData<T> | undefined> {
		const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
		const data = this._store.get(keyPrefix) as CacheItemStore;
		if (!data) {
			return undefined;
		}

		// Check if it is expired
		if (data.expires && Date.now() > data.expires) {
			this._store.delete(keyPrefix);
			return undefined;
		}

		return data as T;
	}

	async set(key: string, value: any, ttl?: number): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
		const data = { value, expires: ttl ? Date.now() + ttl : undefined };
		this._store.set(keyPrefix, data, ttl);
		return true;
	}

	async setMany(entries: KeyvEntry[]): Promise<void> {
		const results: boolean[] = [];
		for (const entry of entries) {
			const result = await this.set(entry.key, entry.value, entry.ttl);
			results.push(result);
		}
	}

	async delete(key: string): Promise<boolean> {
		const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
		return this._store.delete(keyPrefix);
	}

	async clear(): Promise<void> {
		this._store.clear();
	}

	async has(key: string): Promise<boolean> {
		const value = await this.get(key);
		return Boolean(value);
	}

	async getMany<T>(keys: string[]): Promise<Array<StoredData<T | undefined>>> {
		const values = [];
		for (const key of keys) {
			const value = await this.get(key);
			values.push(value);
		}

		return values as Array<StoredData<T | undefined>>;
	}

	async deleteMany(keys: string[]): Promise<boolean> {
		try {
			for (const key of keys) {
				const keyPrefix = this.getKeyPrefix(key, this.getNamespace());
				this._store.delete(keyPrefix);
			}
		} catch (error) {
			this.emit("error", error);
			return false;
		}

		return true;
	}

	/* c8 ignore next 14 */
	iterator<Value>(
		// biome-ignore lint/correctness/noUnusedFunctionParameters: type format
		namespace?: string,
	): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void> {
		throw new Error("Method not implemented.");
	}
}

/**
 * Create a Keyv instance with a generic store that is optimized for in-memory storage.
 * This removes Keyv serialization and deserialization overhead, keyPrefix from Keyv.
 */
export function createKeyv(
	store: Map<any, any> | KeyvMapType,
	options?: KeyvGenericStoreOptions,
) {
	const genericStore = new KeyvGenericStore(store, options);
	const keyv = new Keyv({ store: genericStore, useKeyPrefix: false });
	keyv.serialize = undefined;
	keyv.deserialize = undefined;
	return keyv;
}
