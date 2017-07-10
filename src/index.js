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
			if (Date.now() > data.expires) {
				this.delete(key);
				return undefined;
			}
			return data.value;
		});
	}

	set(key, value, ttl) {
		const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : undefined;
		const data = { value, expires };
		return Promise.resolve(this.store.set(key, data)).then(() => value);
	}

	delete(key) {
		return Promise.resolve(this.store.delete(key));
	}
}

module.exports = Keyv;
