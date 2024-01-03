import {EventEmitter} from 'events';
import {Etcd3, type Lease} from 'etcd3';
import type {StoredData} from 'keyv';
import type {ClearOutput, DeleteManyOutput, DeleteOutput, GetOutput, HasOutput, SetOutput} from './types';

type KeyvEtcdOptions = {
	url?: string;
	uri?: string;
	ttl?: number;
	busyTimeout?: number;
};

class KeyvEtcd<Value = any> extends EventEmitter {
	public ttlSupport: boolean;
	public opts: KeyvEtcdOptions;
	public client: Etcd3;
	public lease?: Lease;
	public namespace?: string;

	constructor(url?: KeyvEtcdOptions | string, options?: KeyvEtcdOptions) {
		super();

		this.ttlSupport = typeof options?.ttl === 'number';

		url = url ?? {};

		if (typeof url === 'string') {
			url = {url};
		}

		if (url.uri) {
			url = {url: url.uri, ...url};
		}

		if (url.ttl) {
			this.ttlSupport = typeof url.ttl === 'number';
		}

		this.opts = {
			url: '127.0.0.1:2379',
			...url,
			...options,
		};

		this.opts.url = this.opts.url!.replace(/^etcd:\/\//, '');

		this.client = new Etcd3({
			hosts: this.opts.url,
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this.client.getRoles().catch(error => this.emit('error', error));

		if (this.ttlSupport) {
			this.lease = this.client.lease(this.opts.ttl! / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	async get(key: string): GetOutput<Value> {
		return this.client.get(key) as unknown as GetOutput<Value>;
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
					if (value.value === null) {
						data.push(undefined);
					} else {
						// @ts-expect-error - value is an object
						data.push(value.value as StoredData<Value>);
					}
				}

				return data;
			});
	}

	async set(key: string, value: Value): SetOutput {
		let client: 'lease' | 'client' = 'client';

		if (this.opts.ttl) {
			client = 'lease';
		}

		// @ts-expect-error - Value needs to be number, string or buffer
		return this[client]!.put(key).value(value);
	}

	async delete(key: string): DeleteOutput {
		if (typeof key !== 'string') {
			return false;
		}

		return this.client.delete().key(key).then(key => key.deleted !== '0');
	}

	async deleteMany(keys: string[]): DeleteManyOutput {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		// @ts-expect-error - x is an object
		return Promise.allSettled(promises).then(values => values.every(x => x.value === true));
	}

	async clear(): ClearOutput {
		const promise = this.namespace
			? this.client.delete().prefix(this.namespace)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}

	async * iterator(namespace?: string) {
		const iterator = await this.client
			.getAll()
			.prefix(namespace ? namespace + ':' : '')
			.keys();

		for await (const key of iterator) {
			const value = await this.get(key);
			yield [key, value];
		}
	}

	async has(key: string): HasOutput {
		return this.client.get(key).exists();
	}

	async disconnect() {
		return this.client.close();
	}
}

export = KeyvEtcd;
