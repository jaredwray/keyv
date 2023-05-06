'use strict';

const EventEmitter = require('events');
const {Buffer} = require('buffer');
const mongoClient = require('mongodb').MongoClient;
const {GridFSBucket} = require('mongodb');
const pify = require('pify');

const keyvMongoKeys = new Set(['url', 'collection', 'namespace', 'serialize', 'deserialize', 'uri', 'useGridFS', 'dialect']);
class KeyvMongo extends EventEmitter {
	constructor(url, options) {
		super();
		this.ttlSupport = false;
		url = url || {};
		if (typeof url === 'string') {
			url = {url};
		}

		if (url.uri) {
			url = {url: url.uri, ...url};
		}

		this.opts = {
			url: 'mongodb://127.0.0.1:27017',
			collection: 'keyv',
			...url,
			...options,
		};

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
			mongoClient.connect(this.opts.url, mongoOptions, (error, client) => {
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
						'count',
					]) {
						this.store[method] = pify(this.store[method].bind(this.store));
					}

					for (const method of [
						'find',
						'drop',
					]) {
						this.bucket[method] = pify(this.bucket[method].bind(this.bucket));
					}

					resolve({bucket: this.bucket, store: this.store, db: this.db});
				} else {
					this.store = this.db.collection(this.opts.collection);
					this.store.createIndex(
						{key: 1},
						{
							unique: true,
							background: true,
						},
					);
					this.store.createIndex(
						{expiresAt: 1},
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
						'count',
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
						resp = Buffer.concat(resp).toString('utf8');
						resolve(resp);
					});

					stream.on('data', chunk => {
						resp.push(chunk);
					});
				});
			});
		}

		return this.connect.then(store =>
			store.findOne({key: {$eq: key}}).then(doc => {
				if (!doc) {
					return undefined;
				}

				return doc.value;
			}),
		);
	}

	getMany(keys) {
		if (this.opts.useGridFS) {
			const promises = [];
			for (const key of keys) {
				promises.push(this.get(key));
			}

			return Promise.allSettled(promises)
				.then(values => {
					const data = [];
					for (const value of values) {
						data.push(value.value);
					}

					return data;
				});
		}

		const results = [...keys];
		return this.connect.then(store =>
			store.s.db.collection(this.opts.collection)
				.find({key: {$in: keys}})
				.project({_id: 0, value: 1, key: 1})
				.toArray().then(values => {
					let i = 0;
					for (const key of keys) {
						const rowIndex = values.findIndex(row => row.key === key);

						results[i] = rowIndex > -1 ? values[rowIndex].value : undefined;

						i++;
					}

					return results;
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
				{key: {$eq: key}},
				{$set: {key, value, expiresAt}},
				{upsert: true},
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
				return bucket.find({filename: key}).toArray()
					.then(files => client.bucket.delete(files[0]._id).then(() => true))
					.catch(() => false);
			});
		}

		return this.connect.then(store =>
			store
				.deleteOne({key: {$eq: key}})
				.then(object => object.deletedCount > 0),
		);
	}

	deleteMany(keys) {
		if (this.opts.useGridFS) {
			return this.connect.then(client => {
				const connection = client.db;
				const bucket = new GridFSBucket(connection, {
					bucketName: this.opts.collection,
				});
				return bucket.find({filename: {$in: keys}}).toArray()
					.then(
						files => {
							if (files.length === 0) {
								return false;
							}

							files.map(file => client.bucket.delete(file._id));
							return true;
						});
			});
		}

		return this.connect.then(store =>
			store
				.deleteMany({key: {$in: keys}})
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
					key: {$regex: this.namespace ? `^${this.namespace}:*` : ''},
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

	async * iterator(namespace) {
		const iterator = await this.connect.then(store =>
			store
				.find({
					key: new RegExp(`^${namespace ? namespace + ':' : '.*'}`),
				})
				.map(x => [x.key, x.value]),
		);
		yield * iterator;
	}

	has(key) {
		if (this.opts.useGridFS) {
			return this.connect.then(client => client.store.count(
				{filename: {$eq: key}},
			).then(doc => doc !== 0));
		}

		return this.connect.then(store =>
			store.count(
				{key: {$eq: key}},
			),
		).then(doc => doc !== 0);
	}
}

module.exports = KeyvMongo;
