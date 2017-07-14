'use strict';

const pify = require('pify');

class KeyvMongo {
	constructor(opts) {
		this.ttlSupport = false;
	}

	get(key) {}

	set(key, value) {}

	delete(key) {}

	clear() {}
}

module.exports = KeyvMongo;
