'use strict';

const redis = require('redis');
const pify = require('pify');

class KeyvRedis {
	constructor(opts) {
		this.ttlSupport = true;
		const client = redis.createClient(opts);
		this.client = ['get', 'set', 'del', 'flushdb'].reduce((obj, method) => {
			obj[method] = pify(client[method].bind(client));
			return obj;
		}, {});
	}

	get(key) {
		return this.client.get(key)
			.then(value => {
				if (value === null) {
					return undefined;
				}
				return JSON.parse(value);
			});
	}

	set(key, value, ttl) {
		return Promise.resolve()
			.then(() => {
				value = JSON.stringify(value);
				if (typeof ttl === 'number') {
					return this.client.set(key, value, 'PX', ttl);
				}
				return this.client.set(key, value);
			});
	}

	delete(key) {
		return this.client.del(key)
			.then(items => items > 0);
	}

	clear() {
		return this.client.flushdb()
			.then(() => undefined);
	}
}

module.exports = KeyvRedis;
