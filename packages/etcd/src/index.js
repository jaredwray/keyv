'use strict';

const EventEmitter = require('events');
const { Etcd3 } = require('etcd3');
const { Policy } = require('cockatiel');

class KeyvEtcd extends EventEmitter {
	constructor(url, options) {
		super();
		this.ttlSupport = false;
		url = url || {};
		if (typeof url === 'string') {
			url = { url };
		}

		if (url.uri) {
			url = Object.assign({ url: url.uri }, url);
		}

		this.opts = Object.assign(
			{
				url: '127.0.0.1:2379',
			},
			url,
			options,
		);

		this.opts.url = this.opts.url.replace(/^etcd:\/\//, '');

		this.policy = Policy.handleAll().retry();
		this.policy.onFailure(error => {
			this.emit('error', error.reason);
		});
		this.client = new Etcd3(options = { hosts: this.opts.url,
			faultHandling: {
				host: () => this.policy,
				global: this.policy,
			} });

		// Https://github.com/microsoft/etcd3/issues/105
		this.client.getRoles().catch();
	}

	get(key) {
		return this.client.get(key);
	}

	set(key, value) {
		return this.client.put(key).value(value);
	}

	delete(key) {
		if (typeof key !== 'string') {
			return Promise.resolve(false);
		}

		return this.client.delete().key(key).then(key => key.deleted !== '0');
	}

	clear() {
		const promise = this.namespace
			? this.client.delete().prefix(this.namespace)
			: this.client.delete().all();
		return promise.then(() => undefined);
	}
}

module.exports = KeyvEtcd;
