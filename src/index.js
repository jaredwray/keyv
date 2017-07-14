'use strict';

class Keyv {
	constructor(opts) {
		this.opts = opts || {};
		this.opts.store = this.opts.store || new Map();
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
			const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : undefined;
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
