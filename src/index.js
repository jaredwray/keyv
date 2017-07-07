'use strict';

class Keyv {
	constructor() {
		this.store = new Map();
	}

	get(key) {
		return Promise.resolve(this.store.get(key));
	}

	set(key, value) {
		return Promise.resolve(this.store.set(key, value)).then(() => value);
	}

	delete(key) {
		return Promise.resolve(this.store.delete(key));
	}
}

module.exports = Keyv;
