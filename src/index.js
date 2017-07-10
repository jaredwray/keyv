'use strict';

class Keyv {
	constructor(opts) {
		this.opts = opts || {};
		this.opts.store = this.opts.store || new Map();
	}

	get(key) {
		return Promise.resolve(this.opts.store.get(key)).then(data => {
			if (!data) {
				return undefined;
			}
			if (!this.opts.store.ttlSupport && Date.now() > data.expires) {
				this.delete(key);
				return undefined;
			}
			return this.opts.store.ttlSupport ? data : data.value;
		});
	}

	set(key, value, ttl) {
		let set;
		if (this.opts.store.ttlSupport) {
			set = this.opts.store.set(key, value, ttl);
		} else {
			const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : undefined;
			const data = { value, expires };
			set = this.opts.store.set(key, data);
		}
		return Promise.resolve(set).then(() => value);
	}

	delete(key) {
		return Promise.resolve(this.opts.store.delete(key));
	}
}

module.exports = Keyv;
