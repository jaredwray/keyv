'use strict';

class Keyv {
	constructor(opts) {
		opts = opts || {};
		this.store = opts.store || new Map();
	}

	get(key) {
		return Promise.resolve(this.store.get(key)).then(data => {
			if (!data) {
				return undefined;
			}
			if (!this.store.ttlSupport && Date.now() > data.expires) {
				this.delete(key);
				return undefined;
			}
			return this.store.ttlSupport ? data : data.value;
		});
	}

	set(key, value, ttl) {
		let set;
		if (this.store.ttlSupport) {
			set = this.store.set(key, value, ttl);
		} else {
			const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : undefined;
			const data = { value, expires };
			set = this.store.set(key, data);
		}
		return Promise.resolve(set).then(() => value);
	}

	delete(key) {
		return Promise.resolve(this.store.delete(key));
	}
}

module.exports = Keyv;
