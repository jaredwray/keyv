import {EventEmitter} from 'events';
import {Etcd3} from 'etcd3';
import {handleAll, retry, ExponentialBackoff} from 'cockatiel';
import type {Lease, PutBuilder} from 'etcd3';
import type {Store, StoredData} from 'keyv';

type KeyvEtcdOptions = {
	url?: string;
	uri?: string;
	ttl?: number;
	busyTimeout?: number;
} | string;

class KeyvEtcd<Value=any> extends EventEmitter implements Store<Value> {
	public ttlSupport: boolean;
	public opts: KeyvEtcdOptions;
	public client: Etcd3;
	public lease?: Lease;
	public namespace?: string;

	constructor(url?: KeyvEtcdOptions, options?: KeyvEtcdOptions) {
		super();
		this.ttlSupport = false;
		this.opts = {
			url: '127.0.0.1:2379',
			...(typeof options === 'string' ? {url: options} : options),
		};

		if (this.opts.uri) {
			this.opts.url = this.opts.uri;
		}

		if (this.opts.ttl) {
			this.ttlSupport = typeof this.opts.ttl === 'number';
		}

		this.opts.url = this.opts.url?.replace(/^etcd:\/\//, '');

		const policy = retry(handleAll, {backoff: new ExponentialBackoff()});
		policy.onFailure(error => {
			this.emit('error', error.reason);
		});

		this.client = new Etcd3({
			hosts: this.opts.url!,
			faultHandling: {
				// @ts-expect-error - iPolicy
				host: () => policy,
				// @ts-expect-error  - iPolicy
				global: policy,
			},
		});

		this.client.getRoles().catch(error => this.emit('error', error));

		if (this.ttlSupport) {
			this.lease = this.client.lease((this.opts.ttl!) / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	async get(key: string): Promise<Value> {
		return this.client.get(key) as unknown as Promise<Value>;
	}

	async getMany(keys: string[]): Promise<Array<StoredData<Value>>> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		const values = await Promise.allSettled(promises);
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
	}

	set(key: string, value: Value): PutBuilder {
		// @ts-expect-error - value needs extends Buffer
		return this.opts.ttl ? this.lease!.put(key).value(value) : this.client.put(key).value(value);
	}

	async delete(key: string): Promise<boolean> {
		if (typeof key !== 'string') {
			return false;
		}

		return this.client.delete().key(key).then(key => key.deleted !== '0');
	}

	async deleteMany(keys: string[]): Promise<boolean> {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises)
			.then(values => values.every(Boolean));
	}

	async clear(): Promise<void> {
		const promise = this.namespace
			? this.client.delete().prefix(this.namespace)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}

	async has(key: string): Promise<boolean> {
		return this.client.get(key).exists();
	}

	disconnect(): void {
		this.client.close();
	}
}

export = KeyvEtcd;
