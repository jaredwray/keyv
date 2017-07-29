'use strict';

const EventEmitter = require('events');
const JSONB = require('json-buffer');

const loadStore = opts => {
	const adapters = {
		redis: 'keyv-redis',
		mongodb: 'keyv-mongo',
		mongo: 'keyv-mongo',
		sqlite: 'keyv-sqlite',
		postgresql: 'keyv-postgres',
		postgres: 'keyv-postgres'
	};
	if (opts.adapter || opts.uri) {
		const adapter = opts.adapter || /^[^:]*/.exec(opts.uri)[0];
		return new (require(adapters[adapter]))(opts);
	}
	return new Map();
};

class Keyv extends EventEmitter {
	constructor(uri, opts) {
		super();
		this.opts = Object.assign(
			{ namespace: 'keyv' },
			(typeof uri === 'string') ? { uri } : uri,
			opts
		);

		if (!this.opts.store) {
			const adapterOpts = Object.assign({}, this.opts);
			this.opts.store = loadStore(adapterOpts);
		}

		if (typeof this.opts.store.on === 'function') {
			this.opts.store.on('error', err => this.emit('error', err));
		}

		this.opts.store.namespace = this.opts.namespace;
	}

	_getKeyPrefix(key) {
		return `${this.opts.namespace}:${key}`;
	}

	get(key) {
		key = this._getKeyPrefix(key);
		const store = this.opts.store;
		return Promise.resolve(store.get(key)).then(data => {
			data = (typeof data === 'string') ? JSONB.parse(data) : data;
			if (data === undefined) {
				return undefined;
			}
			if (!store.ttlSupport && typeof data.expires === 'number' && Date.now() > data.expires) {
				this.delete(key);
				return undefined;
			}
			return store.ttlSupport ? data : data.value;
		});
	}

	set(key, value, ttl) {
		key = this._getKeyPrefix(key);
		ttl = ttl || this.opts.ttl;
		const store = this.opts.store;

		return Promise.resolve()
			.then(() => {
				if (!store.ttlSupport) {
					const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;
					value = { value, expires };
				}
				return store.set(key, JSONB.stringify(value), ttl);
			})
			.then(() => true);
	}

	delete(key) {
		key = this._getKeyPrefix(key);
		const store = this.opts.store;
		return Promise.resolve(store.delete(key));
	}

	clear() {
		const store = this.opts.store;
		return Promise.resolve(store.clear());
	}
}

module.exports = Keyv;
