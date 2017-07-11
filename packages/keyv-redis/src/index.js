'use strict';

const redis = require('redis');
const pify = require('pify');

class KeyvRedis {
	constructor(opts) {
		this.client = redis.createClient(opts);
		this.ttlSupport = true;
		this.redis = {
			get: pify(this.client.get.bind(this.client)),
			set: pify(this.client.set.bind(this.client)),
			del: pify(this.client.del.bind(this.client))
		};
	}

	get(key) {
		return this.redis.get(key)
			.then(JSON.parse);
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
}

module.exports = KeyvRedis;
