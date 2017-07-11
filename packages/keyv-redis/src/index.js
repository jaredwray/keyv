'use strict';

const redis = require('redis');
const pify = require('pify');

class KeyvRedis {
	constructor(opts) {
		this.client = redis.createClient(opts);
	}

	get(key) {
		return pify(this.client.get.bind(this.client))(key)
			.then(JSON.parse);
	}

	set(key, value) {
		return Promise.resolve()
			.then(() => {
				value = JSON.stringify(value);
				return pify(this.client.set.bind(this.client))(key, value);
			});
	}

	delete(key) {
		return pify(this.client.del.bind(this.client))(key)
			.then(items => items > 0);
	}
}

module.exports = KeyvRedis;
