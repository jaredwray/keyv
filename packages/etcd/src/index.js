'use strict';

const EventEmitter = require('events');
const { Etcd3 } = require('etcd3');

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
				url: '127.0.0.1:2379'
			},
			url,
			options,
		);

		this.client = new Etcd3(options = { hosts: this.opts.url });
	}

	get(key) {
		return this.client.get(key);
	}

	set(key, value) {
		return this.client.put(key).value(value);
	}

	delete(key) {
		return this.client.delete().key(key).then(() => true);
	}

	clear() {
		return this.client.delete().all().then(() => undefined);
	}
}

module.exports = KeyvEtcd;
