const EventEmitter = require('events');
const Redis = require('ioredis');

class KeyvRedis extends EventEmitter {
	constructor(uri, options) {
		super();
		this.ttlSupport = true;
		this.opts = {};
		this.opts.dialect = 'redis';

		if ((uri.options && uri.options.family) || (uri.options && uri.isCluster)) {
			this.redis = uri;
		} else {
			options = {...(typeof uri === 'string' ? {uri} : uri), ...options};
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

	getMany(keys) {
		return this.redis.mget(keys)
			.then(rows => rows);
	}

	set(key, value, ttl) {
		if (value === undefined) {
			return Promise.resolve(undefined);
		}

		return Promise.resolve()
			.then(() => {
				if (typeof ttl === 'number') {
					return this.redis.set(key, value, 'PX', ttl);
				}

				return this.redis.set(key, value);
			})
			.then(() => this.redis.sadd(this._getNamespace(), key))
			.then(() => undefined);
	}

	delete(key) {
		return this.redis.del(key)
			.then(items => this.redis.srem(this._getNamespace(), key)
				.then(() => items > 0));
	}

	deleteMany(key) {
		return this.delete(key);
	}

	clear() {
		return this.redis.smembers(this._getNamespace())
			.then(keys => this.redis.del([...keys, this._getNamespace()]))
			.then(() => undefined);
	}

	async * iterator(namespace) {
		const scan = this.redis.scan.bind(this.redis);
		const get = this.redis.mget.bind(this.redis);
		async function * iterate(curs, pattern) {
			const [cursor, keys] = await scan(curs, 'MATCH', pattern);

			if (keys.length > 0) {
				const values = await get(keys);
				for (const [i] of keys.entries()) {
					const key = keys[i];
					const value = values[i];
					yield [key, value];
				}
			}

			if (cursor !== '0') {
				yield * iterate(cursor, pattern);
			}
		}

		yield * iterate(0, `${namespace}:*`);
	}

	has(key) {
		return this.redis.exists(key)
			.then(value => value !== 0);
	}

	disconnect() {
		return this.redis.disconnect();
	}
}

module.exports = KeyvRedis;
