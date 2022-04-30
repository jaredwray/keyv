'use strict';

const EventEmitter = require('events');
const {Etcd3} = require('etcd3');
const {Policy} = require('cockatiel');

class KeyvEtcd extends EventEmitter {
	constructor(url, options) {
		super();
		this.ttlSupport = options && typeof options.ttl === 'number';
		url = url || {};
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

		this.opts.url = this.opts.url.replace(/^etcd:\/\//, '');
		const policy = Policy.handleAll().retry();
		policy.onFailure(error => {
			this.emit('error', error.reason);
		});
		this.client = new Etcd3(options = {hosts: this.opts.url,
			faultHandling: {
				host: () => policy,
				global: policy,
			},
		});

		// Https://github.com/microsoft/etcd3/issues/105
		this.client.getRoles().catch(error => this.emit('error', error));

		if (this.ttlSupport) {
			this.lease = this.client.lease(this.opts.ttl / 1000, {
				autoKeepAlive: false,
			});
		}
	}

	get(key) {
		return this.client.get(key);
	}

	getMany(keys) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises)
			.then(values => {
				const data = [];
				for (const value of values) {
					if (value.value === null) {
						data.push(undefined);
					} else {
						data.push(value.value);
					}
				}

				return data.every(x => x === undefined) ? [] : data;
			});
	}

	set(key, value) {
		return this.opts.ttl ? this.lease.put(key).value(value) : this.client.put(key).value(value);
	}

	delete(key) {
		if (typeof key !== 'string') {
			return Promise.resolve(false);
		}

		return this.client.delete().key(key).then(key => key.deleted !== '0');
	}

	deleteMany(keys) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises)
			.then(values => values.every(x => x.value === true));
	}

	clear() {
		const promise = this.namespace
			? this.client.delete().prefix(this.namespace)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}

	has(key) {
		return this.client.get(key).exists();
	}

	disconnect() {
		return this.client.close();
	}
}

module.exports = KeyvEtcd;
