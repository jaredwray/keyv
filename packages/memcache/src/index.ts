import EventEmitter from 'node:events';
import type{Buffer} from 'node:buffer';
import memcache from 'memjs';
import JSONB from 'json-buffer';
import Keyv, {Store, StoredData} from 'keyv';

type GetOutput<Value> = Value | Promise<Value | undefined> | undefined;

type KeyvMemcacheOptions<Value> = {
	url?: string;
	expires?: number;
} & memcache.ClientOptions & Keyv.Options<Value>;

class KeyvMemcache<Value = any> extends EventEmitter implements Store<Value> {
	public ttlSupport = true;
	public namespace?: string;
	public client: memcache.Client;
	public opts: KeyvMemcacheOptions<Value>;
	constructor(uri?: string, options?: KeyvMemcacheOptions<Value>) {
		super();

		options = {
			...((typeof uri === 'string') ? {uri} : uri),
			...options,
		};

		if (options.uri && options.url === undefined) {
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

	get(key: string): GetOutput<Value> {
		return new Promise((resolve, reject) => {
			this.client.get(this.formatKey(key), (error, value) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					let value_;
					if (value === null) {
						value_ = {
							// @ts-expect-error - value is an object
							value: undefined,
							expires: 0,
						};
					} else {
						value_ = this.opts.deserialize ? this.opts.deserialize(value as unknown as string) as GetOutput<Value> : JSONB.parse(value as unknown as string) as GetOutput<Value>;
					}

					resolve(value_);
				}
			});
		});
	}

	async getMany(keys: string[]): Promise<Array<StoredData<Value>>> {
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

	async set(key: string, value: Value, ttl: number) {
		const options: KeyvMemcacheOptions<Value> = {};

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
					resolve(success!);
				}
			});
		});
	}

	async deleteMany(keys: string[]): Promise<boolean> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises)
			// @ts-expect-error - x is an object
			.then(values => values.every(x => x.value === true));
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
