'use strict';

const EventEmitter = require('events');
const mongojs = require('mongojs');
const pify = require('pify');

class KeyvMongo extends EventEmitter {
	constructor(url, options) {
		super();
		this.ttlSupport = false;
		url = url || {};
		if (typeof url === 'string') {
			url = { url };
		}

		if (url.uri) {
			url = Object.assign({ url: url.uri }, url);
		}

		this.opts = Object.assign({
			url: 'mongodb://127.0.0.1:27017',
			collection: 'keyv',
		}, url, options);
		this.db = mongojs(this.opts.url);

		const collection = this.db.collection(this.opts.collection);
		collection.createIndex({ key: 1 }, {
			unique: true,
			background: true,
		});
		collection.createIndex({ expiresAt: 1 }, {
			expireAfterSeconds: 0,
			background: true,
		});
		this.mongo = ['update', 'findOne', 'remove'].reduce((object, method) => {
			object[method] = pify(collection[method].bind(collection));
			return object;
		}, {});

		this.db.on('error', error => this.emit('error', error));
	}

	get(key) {
		return this.mongo.findOne({ key })
			.then(doc => {
				if (doc === null) {
					return undefined;
				}

				return doc.value;
			});
	}

	set(key, value, ttl) {
		const expiresAt = (typeof ttl === 'number') ? new Date(Date.now() + ttl) : null;
		return this.mongo.update({ key }, { $set: { key, value, expiresAt } }, { upsert: true });
	}

	delete(key) {
		if (typeof key !== 'string') {
			return Promise.resolve(false);
		}

		return this.mongo.remove({ key })
			.then(object => object.n > 0);
	}

	clear() {
		return this.mongo.remove({ key: new RegExp(`^${this.namespace}:`) })
			.then(() => undefined);
	}
}

module.exports = KeyvMongo;
