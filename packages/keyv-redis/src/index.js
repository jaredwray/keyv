const EventEmitter = require('events');
const Redis = require('ioredis');

class KeyvRedis extends EventEmitter {
	constructor(uri, options) {
		super();
		this.ttlSupport = true;

		if (uri instanceof Redis || uri instanceof Redis.Cluster) {
			this.redis = uri;
		} else {
			options = Object.assign({}, typeof uri === 'string' ? { uri } : uri, options);
			this.redis = new Redis(options.uri, options);
		}

		this.redis.on('error', error => this.emit('error', error));
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
			.then(items => this.redis.srem(this._getNamespace(), key)
				.then(() => items > 0));
	}

	clear() {
		return this.redis.smembers(this._getNamespace())
			.then(keys => this.redis.del(keys.concat(this._getNamespace())))
			.then(() => undefined);
	}
}

module.exports = KeyvRedis;
