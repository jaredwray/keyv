'use strict';

const EventEmitter = require('events');
const JSONB = require('json-buffer');

const loadStore = opts => {
	const adapters = {
		redis: 'keyv-redis',
		mongodb: 'keyv-mongo',
		mongo: 'keyv-mongo'
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
			{},
			(typeof uri === 'string') ? { uri } : uri,
			opts
		);

		if (!this.opts.store) {
			const adapterOpts = Object.assign({ keyv: this }, this.opts);
			this.opts.store = loadStore(adapterOpts);
		}
	}

	get(key) {
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
		const store = this.opts.store;
		return Promise.resolve(store.delete(key));
	}

	clear() {
		const store = this.opts.store;
		return Promise.resolve(store.clear());
	}
}

module.exports = Keyv;
