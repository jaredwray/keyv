'use strict';

const adapters = {
	redis: 'keyv-redis',
	mongodb: 'keyv-mongo'
};

class Keyv {
	constructor(uri, opts) {
		this.opts = Object.assign(
			{},
			(typeof uri === 'string') ? { uri, adapter: uri.match(/^[^:]*/)[0] } : uri,
			opts
		);

		if (!this.opts.store) {
			this.opts.store = this.opts.adapter ? new (require(adapters[this.opts.adapter]))(opts) : new Map();
		}
	}

	get(key) {
		const store = this.opts.store;
		return Promise.resolve(store.get(key)).then(data => {
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
		let set;
		if (store.ttlSupport) {
			set = store.set(key, value, ttl);
		} else {
			const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;
			const data = { value, expires };
			set = store.set(key, data);
		}
		return Promise.resolve(set).then(() => value);
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
