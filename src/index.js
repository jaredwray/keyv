'use strict';

class keyv {
	constructor() {
		this.store = new Map();
	}

	get(key) {
		return this.store.get(key);
	}

	set(key, value) {
		return this.store.set(key, value);
	}

	delete(key) {
		return this.store.delete(key);
	}
}

module.exports = keyv;
