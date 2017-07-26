'use strict';

const EventEmitter = require('events');
const mongojs = require('mongojs');
const pify = require('pify');

class KeyvMongo extends EventEmitter {
	constructor(opts) {
		super();
		this.ttlSupport = false;
		opts = opts || {};
		if (typeof opts === 'string') {
			opts = { url: opts };
		}
		if (opts.uri) {
			opts = Object.assign({ url: opts.uri }, opts);
		}
		this.opts = Object.assign({
			url: 'mongodb://127.0.0.1:27017',
			collection: 'keyv'
		}, opts);
		this.db = mongojs(this.opts.url);

		const collection = this.db.collection(this.opts.collection);
		collection.createIndex({ key: 1 }, {
			unique: true,
			background: true
		});
		collection.createIndex({ expiresAt: 1 }, {
			expireAfterSeconds: 0,
			background: true
		});
		this.mongo = ['update', 'findOne', 'remove'].reduce((obj, method) => {
			obj[method] = pify(collection[method].bind(collection));
			return obj;
		}, {});

		this.db.on('error', err => this.emit('error', err));
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
		return this.mongo.update({ key }, { key, value, expiresAt }, { upsert: true });
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
