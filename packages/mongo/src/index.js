'use strict';

const EventEmitter = require('events');
const mongoClient = require('mongodb').MongoClient;
const pify = require('pify');

const keyvMongoKeys = new Set(['url', 'collection', 'namespace', 'serialize', 'deserialize', 'uri']);
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

		this.opts = Object.assign(
			{
				url: 'mongodb://127.0.0.1:27017',
				collection: 'keyv',
			},
			url,
			options,
		);

		const mongoOptions = Object.fromEntries(
			Object.entries(this.opts).filter(
				([k]) => !keyvMongoKeys.has(k),
			),
		);

		// Implementation from sql by lukechilds,
		this.connect = new Promise(resolve => {
			mongoClient.connect(this.opts.url, mongoOptions
				, (error, client) => {
					if (error) {
						return this.emit('error', error);
					}

					this.db = client.db(this.opts.db);
					this.store = this.db.collection(this.opts.collection);
					this.store.createIndex(
						{ key: 1 },
						{
							unique: true,
							background: true,
						},
					);
					this.store.createIndex(
						{ expiresAt: 1 },
						{
							expireAfterSeconds: 0,
							background: true,
						},
					);

					for (const method of [
						'updateOne',
						'findOne',
						'deleteOne',
						'deleteMany',
					]) {
						this.store[method] = pify(this.store[method].bind(this.store));
					}

					resolve(this.store);
				});
		});
	}

	get(key) {
		return this.connect.then(store =>
			store.findOne({ key: { $eq: key } }).then(doc => {
				if (!doc) {
					return undefined;
				}

				return doc.value;
			}),
		);
	}

	set(key, value, ttl) {
		const expiresAt = typeof ttl === 'number' ? new Date(Date.now() + ttl) : null;
		return this.connect.then(store =>
			store.updateOne(
				{ key: { $eq: key } },
				{ $set: { key, value, expiresAt } },
				{ upsert: true },
			),
		);
	}

	delete(key) {
		if (typeof key !== 'string') {
			return Promise.resolve(false);
		}

		return this.connect.then(store =>
			store
				.deleteOne({ key: { $eq: key } })
				.then(object => object.deletedCount > 0),
		);
	}

	clear() {
		return this.connect.then(store =>
			store
				.deleteMany({
					key: new RegExp(`^${this.namespace}:`),
				})
				.then(() => undefined),
		);
	}
}

module.exports = KeyvMongo;
