'use strict';

const redis = require('redis');
const pify = require('pify');

class KeyvRedis {
	constructor(opts) {
		this.client = redis.createClient(opts);
		this.ttlSupport = true;
		this.redis = ['get', 'set', 'del', 'flushdb'].reduce((obj, method) => {
			obj[method] = pify(this.client[method].bind(this.client));
			return obj;
		}, {});
	}

	get(key) {
		return this.redis.get(key)
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
					return this.redis.set(key, value, 'PX', ttl);
				}
				return this.redis.set(key, value);
			});
	}

	delete(key) {
		return this.redis.del(key)
			.then(items => items > 0);
	}

	clear() {
		return this.redis.flushdb()
			.then(() => undefined);
	}
}

module.exports = KeyvRedis;
