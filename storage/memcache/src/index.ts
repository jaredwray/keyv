import EventEmitter from "node:events";
import { defaultDeserialize } from "@keyv/serialize";
import type { KeyvStoreAdapter, StoredData } from "keyv";
import { Memcache, type MemcacheOptions } from "memcache";

export type KeyvMemcacheOptions = {
	url?: string;
	expires?: number;
} & Partial<MemcacheOptions> &
	// biome-ignore lint/suspicious/noExplicitAny: type format
	Record<string, any>;

export class KeyvMemcache extends EventEmitter implements KeyvStoreAdapter {
	public namespace?: string;
	public client: Memcache;
	public opts: KeyvMemcacheOptions;
	constructor(uri?: string, options?: KeyvMemcacheOptions) {
		super();

		options = {
			...(typeof uri === "string" ? { uri } : uri),
			...options,
		};

		if (options.uri && options.url === undefined) {
			options.url = options.uri;
		}

		if (uri === undefined) {
			uri = "localhost:11211";
			options.url = options.uri = uri;
		}

		this.opts = options;

		const { url, uri: _uri, expires, ...memcacheOptions } = options;
		this.client = new Memcache({ nodes: [uri], ...memcacheOptions });
	}

	_getNamespace(): string {
		// biome-ignore lint/style/noNonNullAssertion: fix this
		return `namespace:${this.namespace!}`;
	}

	async get<Value>(key: string): Promise<StoredData<Value>> {
		try {
			const value = await this.client.get(this.formatKey(key));
			if (value === undefined) {
				return {
					value: undefined,
					expires: 0,
				};
			}

			return this.opts.deserialize
				? this.opts.deserialize(value)
				: defaultDeserialize(value);
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	async getMany<Value>(keys: string[]) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises).then((values) => {
			const data: Array<StoredData<Value>> = [];
			for (const value of values) {
				// @ts-expect-error - value is an object
				data.push(value.value as StoredData<Value>);
			}

			return data;
		});
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number) {
		const exptime = ttl !== undefined ? Math.floor(ttl / 1000) : 0;

		try {
			await this.client.set(this.formatKey(key), value as string, exptime);
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	async delete(key: string): Promise<boolean> {
		try {
			return await this.client.delete(this.formatKey(key));
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	async deleteMany(keys: string[]) {
		const promises = keys.map(async (key) => this.delete(key));
		const results = await Promise.allSettled(promises);
		// @ts-expect-error - x is an object
		return results.every((x) => x.value === true);
	}

	async clear(): Promise<void> {
		try {
			await this.client.flush();
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
	}

	formatKey(key: string) {
		let result = key;

		if (this.namespace) {
			result = `${this.namespace.trim()}:${key.trim()}`;
		}

		return result;
	}

	async has(key: string): Promise<boolean> {
		try {
			const value = await this.client.get(this.formatKey(key));
			return value !== undefined;
		} catch {
			return false;
		}
	}

	async disconnect(): Promise<void> {
		await this.client.disconnect();
	}
}

export default KeyvMemcache;
