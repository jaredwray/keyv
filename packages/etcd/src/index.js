'use strict';

const EventEmitter = require('events');

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

		options = Object.assign({
			dialect: 'etcd',
			uri: 'etcd://:memory:',
		}, options);
		options.db = options.uri.replace(/^etcd:\/\//, '');

		this.opts = Object.assign(
			{
				url: 'etcd://127.0.0.1:2379',
				collection: 'keyv',
			},
			url,
			options,
		);

		console.log(this.opts);
	}

	get(key) {
		console.log(key);
	}

	set(key, value, ttl) {
		console.log(key + value + ttl);
	}

	delete(key) {
		console.log(key);
	}

	clear() {}
}

module.exports = KeyvEtcd;
