'use strict';

const MongoClient = require('mongodb').MongoClient;
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
		this.connected = new Promise((resolve, reject) => {
			MongoClient.connect(opts.url, (err, db) => {
				if(err) {
					return reject(err);
				}
				return resolve(db.collection(opts.collection));
			});
		});
	}

	get(key) {}

	set(key, value) {}

	delete(key) {}

	clear() {}
}

module.exports = KeyvMongo;
