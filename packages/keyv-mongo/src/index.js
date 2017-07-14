'use strict';

const mongojs = require('mongojs')
const pify = require('pify');

class KeyvMongo {
	constructor(opts) {
		this.ttlSupport = false;
		if (typeof opts === 'string') {
			opts = { url: opts };
		}
		this.opts = Object.assign({
			url: 'mongodb://127.0.0.1:27017',
			collection: 'keyv'
		}, opts);
		this.db = mongojs(this.opts.url);
	}

	get(key) {}

	set(key, value) {}

	delete(key) {}

	clear() {}
}

module.exports = KeyvMongo;
