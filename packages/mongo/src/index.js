'use strict';

const EventEmitter = require('events');
const Buffer = require('buffer').Buffer;
const mongoClient = require('mongodb').MongoClient;
const GridFSBucket = require('mongodb').GridFSBucket;
const pify = require('pify');

const keyvMongoKeys = new Set(['url', 'collection', 'namespace', 'serialize', 'deserialize', 'uri', 'useGridFS']);
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

		this.opts = Object.fromEntries(
			Object.entries(this.opts).filter(
				([k]) => keyvMongoKeys.has(k),
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
					if (this.opts.useGridFS) {
						this.bucket = new GridFSBucket(this.db, {
							readPreference: this.opts.readPreference || 'primary',
							bucketName: this.opts.collection,
						});
						this.store = this.db.collection(this.opts.collection + '.files');
						this.store.createIndex({
							filename: 'hashed',
						});
						this.store.createIndex({
							uploadDate: -1,
						});
						this.store.createIndex({
							'metadata.expiresAt': 1,
						});
						this.store.createIndex({
							'metadata.lastAccessed': 1,
						});

						for (const method of [
							'updateOne',
						]) {
							this.store[method] = pify(this.store[method].bind(this.store));
						}

						for (const method of [
							'find',
							'drop',
						]) {
							this.bucket[method] = pify(this.bucket[method].bind(this.bucket));
						}

						resolve({ bucket: this.bucket, store: this.store, db: this.db });
					} else {
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
					}
				});
		});
	}

	get(key) {
		if (this.opts.useGridFS) {
			return this.connect.then(client => {
				client.store.updateOne({
					filename: key,
				}, {
					$set: {
						'metadata.lastAccessed': new Date(),
					},
				});

				const stream = client.bucket.openDownloadStreamByName(key);
				return new Promise(resolve => {
					let resp = [];
					stream.on('error', () => resolve());

					stream.on('end', () => {
						resp = Buffer.concat(resp).toString('utf-8');
						resolve(resp);
					});

					stream.on('data', chunk => {
						resp.push(chunk);
					});
				});
			});
		}

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

		if (this.opts.useGridFS) {
			return this.connect.then(client => {
				const stream = client.bucket.openUploadStream(key, {
					metadata: {
						expiresAt,
						lastAccessed: new Date(),
					},
				});

				return new Promise(resolve => {
					stream.on('finish', () => {
						resolve(stream);
					});
					stream.end(value);
				});
			});
		}

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

		if (this.opts.useGridFS) {
			return this.connect.then(client => {
				const connection = client.db;
				const bucket = new GridFSBucket(connection, {
					bucketName: this.opts.collection,
				});
				return bucket.find({ filename: key }).toArray()
					.then(files => client.bucket.delete(files[0]._id).then(() => true))
					.catch(() => false);
			});
		}

		return this.connect.then(store =>
			store
				.deleteOne({ key: { $eq: key } })
				.then(object => object.deletedCount > 0),
		);
	}

	clear() {
		if (this.opts.useGridFS) {
			return this.connect.then(client => client.bucket.drop().then(() => undefined));
		}

		return this.connect.then(store =>
			store
				.deleteMany({
					key: new RegExp(`^${this.namespace}:`),
				})
				.then(() => undefined),
		);
	}

	clearExpired() {
		if (!this.opts.useGridFS) {
			return false;
		}

		return this.connect.then(client => {
			const connection = client.db;
			const bucket = new GridFSBucket(connection, {
				bucketName: this.opts.collection,
			});

			return bucket.find({
				'metadata.expiresAt': {
					$lte: new Date(Date.now()),
				},
			}).toArray()
				.then(expiredFiles => Promise.all(expiredFiles.map(file => client.bucket.delete(file._id))).then(() => true));
		});
	}

	clearUnusedFor(seconds) {
		if (!this.opts.useGridFS) {
			return false;
		}

		return this.connect.then(client => {
			const connection = client.db;
			const bucket = new GridFSBucket(connection, {
				bucketName: this.opts.collection,
			});

			return bucket.find({
				'metadata.lastAccessed': {
					$lte: new Date(Date.now() - (seconds * 1000)),
				},
			}).toArray()
				.then(lastAccessedFiles => Promise.all(lastAccessedFiles.map(file => client.bucket.delete(file._id))).then(() => true));
		});
	}
}

module.exports = KeyvMongo;
