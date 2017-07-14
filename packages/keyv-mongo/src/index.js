'use strict';

const mongojs = require('mongojs');
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
		this.mongo = ['update', 'findOne', 'remove'].reduce((obj, method) => {
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

	delete(key) {
		if (typeof key !== 'string') {
			return Promise.resolve(false);
		}
		return this.mongo.remove({ key })
			.then(obj => obj.n > 0);
	}

	clear() {
		return this.mongo.remove()
			.then(() => undefined);
	}
}

module.exports = KeyvMongo;
