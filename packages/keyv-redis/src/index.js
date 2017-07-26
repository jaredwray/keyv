'use strict';

const EventEmitter = require('events');
const redis = require('redis');
const pify = require('pify');

class KeyvRedis extends EventEmitter {
	constructor(opts) {
		super();
		this.ttlSupport = true;
		opts = opts || {};
		if (opts.uri) {
			opts = Object.assign({}, { url: opts.uri }, opts);
		}

		const client = redis.createClient(opts);

		this.redis = ['get', 'set', 'sadd', 'del', 'srem', 'smembers'].reduce((obj, method) => {
			obj[method] = pify(client[method].bind(client));
			return obj;
		}, {});

		client.on('error', err => this.emit('error', err));
	}

	_getNamespace() {
		return `namespace:${this.namespace}`;
	}

	get(key) {
		return this.redis.get(key)
			.then(value => {
				if (value === null) {
					return undefined;
				}
				return value;
			});
	}

	set(key, value, ttl) {
		if (typeof value === 'undefined') {
			return Promise.resolve(undefined);
		}
		return Promise.resolve()
			.then(() => {
				if (typeof ttl === 'number') {
					return this.redis.set(key, value, 'PX', ttl);
				}
				return this.redis.set(key, value);
			})
			.then(() => this.redis.sadd(this._getNamespace(), key));
	}

	delete(key) {
		return this.redis.del(key)
			.then(items => {
				return this.redis.srem(this._getNamespace(), key)
					.then(() => items > 0);
			});
	}

	clear() {
		return this.redis.smembers(this._getNamespace())
			.then(keys => this.redis.del.apply(null, keys.concat(this._getNamespace())))
			.then(() => undefined);
	}
}

module.exports = KeyvRedis;
