'use strict';

const mongojs = require('mongojs')
const pify = require('pify');

class KeyvMongo {
	constructor(opts) {
		this.ttlSupport = false;
		if (typeof opts === 'string') {
			opts = { url: opts };
		}
		opts = Object.assign({
			url: 'mongodb://127.0.0.1:27017',
			collection: 'keyv'
		}, opts);
		this.db = mongojs(opts.url);

		const collection = this.db.collection(opts.collection);
		this.mongo = ['update', 'findOne'].reduce((obj, method) => {
			obj[method] = pify(collection[method].bind(collection));
			return obj;
		}, {});
	}

	get(key) {
		return this.mongo.findOne({ key })
			.then(doc => doc.value);
	}

	set(key, value) {
		return this.mongo.update({ key }, { key, value }, { upsert: true });
	}

	delete(key) {}

	clear() {}
}

module.exports = KeyvMongo;
