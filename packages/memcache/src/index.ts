import EventEmitter from 'node:events';
import type {Buffer} from 'node:buffer';
import memcache from 'memjs';
import JSONB from 'json-buffer';
import {KeyvStoreAdapter, StoredData} from 'keyv';

type KeyvMemcacheOptions = {
	url?: string;
	expires?: number;
} & memcache.ClientOptions & Record<string, any>;

class KeyvMemcache extends EventEmitter implements KeyvStoreAdapter {
	public ttlSupport = true;
	public namespace?: string;
	public client: memcache.Client;
	public opts: KeyvMemcacheOptions;
	constructor(uri?: string, options?: KeyvMemcacheOptions) {
		super();

		options = {
			...((typeof uri === 'string') ? {uri} : uri),
			...options,
		};

		if (options.uri && options.url === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			options.url = options.uri;
		}

		if (uri === undefined) {
			uri = 'localhost:11211';
			// eslint-disable-next-line no-multi-assign
			options.url = options.uri = uri;
		}

		this.opts = options;

		this.client = memcache.Client.create(uri, options);
	}

	_getNamespace(): string {
		return `namespace:${this.namespace!}`;
	}

	async get<Value>(key: string): Promise<StoredData<Value>> {
		return new Promise((resolve, reject) => {
			this.client.get(this.formatKey(key), (error, value) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					let value_: StoredData<Value>;
					if (value === null) {
						value_ = {
							value: undefined,
							expires: 0,
						};
					} else {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-call
						value_ = (this.opts.deserialize ? this.opts.deserialize(value as unknown as string) : JSONB.parse(value as unknown as string)) as StoredData<Value>;
					}

					resolve(value_);
				}
			});
		});
	}

	async getMany<Value>(keys: string[]) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises)
			.then(values => {
				const data: Array<StoredData<Value>> = [];
				for (const value of values) {
					// @ts-expect-error - value is an object
					data.push(value.value as StoredData<Value>);
				}

				return data;
			});
	}

	async set(key: string, value: any, ttl?: number) {
		const options: KeyvMemcacheOptions = {};

		if (ttl !== undefined) {
			// eslint-disable-next-line no-multi-assign
			options.expires = options.ttl = Math.floor(ttl / 1000); // Moving to seconds
		}

		return new Promise((resolve, reject) => {
			this.client.set(this.formatKey(key), value as unknown as Buffer, options, (error, success) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					resolve(success);
				}
			});
		});
	}

	async delete(key: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			this.client.delete(this.formatKey(key), (error, success) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					resolve(Boolean(success));
				}
			});
		});
	}

	async deleteMany(keys: string[]) {
		const promises = keys.map(async key => this.delete(key));
		const results = await Promise.allSettled(promises);
		// @ts-expect-error - x is an object
		return results.every(x => x.value === true);
	}

	async clear(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.client.flush(error => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					resolve(undefined);
				}
			});
		});
	}

	formatKey(key: string) {
		let result = key;

		if (this.namespace) {
			result = this.namespace.trim() + ':' + key.trim();
		}

		return result;
	}

	async has(key: string): Promise<boolean> {
		return new Promise(resolve => {
			this.client.get(this.formatKey(key), (error, value) => {
				if (error) {
					resolve(false);
				} else {
					resolve(value !== null);
				}
			});
		});
	}
}

export = KeyvMemcache;
