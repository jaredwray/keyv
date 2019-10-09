import EventEmitter from 'events';
import { MongoClient, Collection } from 'mongodb';
import { KeyvStore, KeyvStoreObject } from 'keyv';

export interface KeyvMongoOptions {
	collection: string;
	url: string;
	uri?: string;
}

interface Document<TVal> {
	key: string;
	value: KeyvStoreObject<TVal>;
	expiresAt: Date | null;
}

export default class KeyvMongo<TVal> extends EventEmitter implements KeyvStore<TVal, KeyvStoreObject<TVal>> {
	public namespace!: string;

	public ttlSupport = false; // @TODO this doesn't look right

	public opts: KeyvMongoOptions;

	public mongo: Promise<void | Collection<Document<TVal>>>;

	constructor(
		urlOrOpts: string | Partial<KeyvMongoOptions> = {},
		_opts: Partial<KeyvMongoOptions> = {}
	) {
		super();

		this.opts = {
			url: 'mongodb://127.0.0.1:27017',
			collection: 'keyv',
			...(typeof urlOrOpts === 'string' ?
				{ url: urlOrOpts } :
				(urlOrOpts.uri ? { url: urlOrOpts.uri, ...urlOrOpts } : urlOrOpts)
			),
			..._opts
		};

		this.mongo = new Promise<Collection<Document<TVal>>>((resolve, reject) =>
			MongoClient.connect(this.opts.url, (err, client) => {
				if (err !== null) {
					return reject(err);
				}

				const db = client.db();
				const collection = db.collection(this.opts.collection);

				collection.createIndex({ key: 1 }, {
					unique: true,
					background: true
				});
				collection.createIndex({ expiresAt: 1 }, {
					expireAfterSeconds: 0,
					background: true
				});

				db.on('error', err => this.emit('error', err));

				resolve(collection);
			})
		).catch(err => {
			this.emit('error', err);
		});
	}

	public async get(key: string): Promise<void | KeyvStoreObject<TVal>> {
		const collection = await this.mongo;
		if (!collection) {
			return;
		}

		const doc = await collection.findOne({ key });
		return doc === null ? undefined : doc.value;
	}

	public async set(key: string, value: KeyvStoreObject<TVal>, ttl?: number): Promise<unknown> {
		const collection = await this.mongo;
		if (!collection) {
			return;
		}

		const expiresAt = (typeof ttl === 'number') ? new Date(Date.now() + ttl) : null;
		return collection.replaceOne({ key }, { key, value, expiresAt }, { upsert: true });
	}

	public async delete(key: string): Promise<boolean> {
		if (typeof key !== 'string') {
			return false;
		}

		const collection = await this.mongo;
		if (!collection) {
			return false;
		}

		const { deletedCount } = await collection.deleteOne({ key });
		return deletedCount !== undefined && deletedCount > 0;
	}

	public async clear(): Promise<void> {
		const collection = await this.mongo;
		if (!collection) {
			return;
		}

		await collection.deleteMany({ key: new RegExp(`^${this.namespace}:`) });
	}
}

