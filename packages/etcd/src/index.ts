import {EventEmitter} from 'events';
import type {Lease} from 'etcd3';
import {Etcd3} from 'etcd3';
import {ExponentialBackoff, handleAll, retry} from 'cockatiel';
import type {Store, StoredData} from 'keyv';

type KeyvEtcdOptions = {
	url?: string;
	uri?: string;
	ttl?: number;
	busyTimeout?: number;
};

type GetOutput<Value> = Value | Promise<Value | undefined> | undefined;

class KeyvEtcd<Value = any> extends EventEmitter implements Store<Value> {
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

		const policy = retry(handleAll, {backoff: new ExponentialBackoff()});
		policy.onFailure(error => {
			this.emit('error', error.reason);
		});

		this.client = new Etcd3({
			hosts: this.opts.url,
			faultHandling: {
				// @ts-expect-error - iPolicy
				host: () => policy,
				// @ts-expect-error - iPolicy
				global: policy,
			},
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this.client.getRoles().catch(error => this.emit('error', error));

		if (this.ttlSupport) {
			this.lease = this.client.lease(this.opts.ttl! / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	get(key: string): GetOutput<Value> {
		return this.client.get(key) as unknown as GetOutput<Value>;
	}

	getMany(keys: string[]): Promise<Array<StoredData<Value>>> {
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
						data.push(value.value);
					}
				}

				return data;
			});
	}

	set(key: string, value: Value) {
		let client: 'lease' | 'client' = 'client';

		if (this.opts.ttl) {
			client = 'lease';
		}

		// @ts-expect-error - Value needs to be number, string or buffer
		return this[client]!.put(key).value(value);
	}

	delete(key: string): Promise<boolean> {
		if (typeof key !== 'string') {
			return Promise.resolve(false);
		}

		return this.client.delete().key(key).then(key => key.deleted !== '0');
	}

	deleteMany(keys: string[]): Promise<boolean> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		// @ts-expect-error - x is an object
		return Promise.allSettled(promises).then(values => values.every(x => x.value === true));
	}

	clear(): Promise<void> {
		const promise = this.namespace
			? this.client.delete().prefix(this.namespace)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}

	has(key: string): Promise<boolean> {
		return this.client.get(key).exists();
	}

	disconnect() {
		return this.client.close();
	}
}

export = KeyvEtcd;
