import { Buffer } from "node:buffer";
import { Hookified } from "hookified";
import Keyv, { type KeyvEntry, type KeyvStorageAdapter, type KeyvStorageGetResult } from "keyv";
import {
	GridFSBucket,
	MongoBulkWriteError,
	type MongoClientOptions,
	MongoClient as mongoClient,
	type ReadPreference,
} from "mongodb";
import type { KeyvMongoConnect, KeyvMongoOptions } from "./types.js";

/**
 * MongoDB storage adapter for Keyv.
 * Provides a persistent key-value store using MongoDB as the backend.
 */
export class KeyvMongo extends Hookified implements KeyvStorageAdapter {
	/**
	 * The MongoDB connection URI.
	 * @default 'mongodb://127.0.0.1:27017'
	 */
	private _url = "mongodb://127.0.0.1:27017";

	/**
	 * The collection name used for storage.
	 * @default 'keyv'
	 */
	private _collection = "keyv";

	/**
	 * The namespace used to prefix keys for multi-tenant separation.
	 */
	private _namespace?: string;

	/**
	 * Whether to use GridFS for storing values.
	 * @default false
	 */
	private _useGridFS = false;

	/**
	 * The database name for the MongoDB connection.
	 * @default undefined
	 */
	private _db?: string;

	/**
	 * The MongoDB read preference for GridFS operations.
	 * @default undefined
	 */
	private _readPreference?: ReadPreference;

	/**
	 * Additional MongoClientOptions passed through to the MongoDB driver.
	 */
	private _mongoOptions: MongoClientOptions = {};

	/**
	 * Promise that resolves to the MongoDB connection details once the client has connected
	 * and the required indexes have been created.
	 */
	public connect: Promise<KeyvMongoConnect>;

	/**
	 * Creates a new KeyvMongo instance.
	 * @param url - Configuration options, connection URI string, or undefined for defaults.
	 * @param options - Additional configuration options that override the first parameter.
	 */
	constructor(url?: KeyvMongoOptions | string, options?: KeyvMongoOptions) {
		super({ throwOnEmptyListeners: false });

		let mergedOptions: KeyvMongoOptions = {};

		if (typeof url === "string") {
			this._url = url;
			if (options) {
				mergedOptions = options;
			}
		} else if (url) {
			mergedOptions = { ...url, ...options };
		} else if (options) {
			mergedOptions = options;
		}

		if (mergedOptions.uri !== undefined) {
			this._url = mergedOptions.uri;
		}

		if (mergedOptions.url !== undefined) {
			this._url = mergedOptions.url;
		}

		if (mergedOptions.collection !== undefined) {
			this._collection = mergedOptions.collection;
		}

		if (mergedOptions.namespace !== undefined) {
			this._namespace = mergedOptions.namespace;
		}

		if (mergedOptions.useGridFS !== undefined) {
			this._useGridFS = mergedOptions.useGridFS;
		}

		if (mergedOptions.db !== undefined) {
			this._db = mergedOptions.db;
		}

		if (mergedOptions.readPreference !== undefined) {
			this._readPreference = mergedOptions.readPreference;
		}

		this._mongoOptions = this.extractMongoOptions(mergedOptions);

		this.connect = this.initConnection();
		// Prevent an unhandled promise rejection if the eager connection fails before
		// any operation awaits `this.connect`. Errors are still surfaced via the `error`
		// event and re-thrown for callers that await the promise directly.
		this.connect.catch(() => {});
	}

	/**
	 * Get the MongoDB connection URI.
	 * @returns The MongoDB connection URI.
	 * @default 'mongodb://127.0.0.1:27017'
	 */
	public get url(): string {
		return this._url;
	}

	/**
	 * Set the MongoDB connection URI.
	 * @param value - The MongoDB connection URI to use.
	 */
	public set url(value: string) {
		this._url = value;
	}

	/**
	 * Get the collection name used for storage.
	 * @returns The collection name used for storage.
	 * @default 'keyv'
	 */
	public get collection(): string {
		return this._collection;
	}

	/**
	 * Set the collection name used for storage.
	 * @param value - The collection name to use for storage.
	 */
	public set collection(value: string) {
		this._collection = value;
	}

	/**
	 * Get the namespace for the adapter. If undefined, no namespace prefix is applied.
	 * @returns The current namespace, or `undefined` if no namespace is set.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.
	 * @param value - The namespace to use, or `undefined` to disable namespacing.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get whether GridFS is used for storing values. This is read-only and can only be set via the constructor
	 * because the MongoDB connection shape differs between GridFS and standard modes.
	 * @returns `true` if GridFS is used for storing values, `false` otherwise.
	 * @default false
	 */
	public get useGridFS(): boolean {
		return this._useGridFS;
	}

	/**
	 * Get the database name for the MongoDB connection.
	 * @returns The database name, or `undefined` if none is set.
	 */
	public get db(): string | undefined {
		return this._db;
	}

	/**
	 * Set the database name for the MongoDB connection.
	 * @param value - The database name to use, or `undefined` to use the driver default.
	 */
	public set db(value: string | undefined) {
		this._db = value;
	}

	/**
	 * Get the MongoDB read preference for GridFS operations.
	 * @returns The configured read preference, or `undefined` if none is set.
	 */
	public get readPreference(): ReadPreference | undefined {
		return this._readPreference;
	}

	/**
	 * Set the MongoDB read preference for GridFS operations.
	 * @param value - The read preference to use, or `undefined` to use the driver default.
	 */
	public set readPreference(value: ReadPreference | undefined) {
		this._readPreference = value;
	}

	/**
	 * Get a value from the store by key. In GridFS mode, also updates the `lastAccessed` timestamp.
	 * @template Value - The type of the stored value.
	 * @param key - The key to retrieve.
	 * @returns The stored value, or `undefined` if the key does not exist or has expired.
	 */
	public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
		const client = await this.connect;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (client.useGridFS) {
			const file = await client.store.findOne({
				filename: { $eq: strippedKey },
				"metadata.namespace": { $eq: ns },
			});

			if (!file) {
				return undefined;
			}

			// Delete expired GridFS entry
			if (file.metadata?.expiresAt && new Date(file.metadata.expiresAt as Date) <= new Date()) {
				await client.bucket.delete(file._id);
				return undefined;
			}

			await client.store.updateOne(
				{ _id: { $eq: file._id } },
				{
					$set: {
						"metadata.lastAccessed": new Date(),
					},
				},
			);

			const stream = client.bucket.openDownloadStream(file._id);

			return new Promise((resolve) => {
				const resp: Uint8Array[] = [];
				/* v8 ignore next -- @preserve */
				stream.on("error", () => {
					resolve(undefined);
				});

				stream.on("end", () => {
					const data = Buffer.concat(resp).toString("utf8");
					resolve(data as KeyvStorageGetResult<Value>);
				});

				stream.on("data", (chunk) => {
					resp.push(chunk as Uint8Array);
				});
			});
		}

		const document = await client.store.findOne({
			key: { $eq: strippedKey },
			namespace: { $eq: ns },
		});

		if (!document) {
			return undefined;
		}

		// Delete expired entry
		if (document.expiresAt && new Date(document.expiresAt as Date) <= new Date()) {
			await client.store.deleteOne({ _id: document._id });
			return undefined;
		}

		return document.value as KeyvStorageGetResult<Value>;
	}

	/**
	 * Get multiple values from the store at once. In standard mode, uses a single query with the `$in` operator.
	 * In GridFS mode, each key is fetched individually in parallel.
	 * @template Value - The type of the stored values.
	 * @param keys - Array of keys to retrieve.
	 * @returns Array of values in the same order as the input keys. Missing keys return `undefined`.
	 */
	public async getMany<Value>(keys: string[]): Promise<Array<KeyvStorageGetResult<Value>>> {
		if (this._useGridFS) {
			const promises = [];
			for (const key of keys) {
				promises.push(this.get(key));
			}

			const values = await Promise.allSettled(promises);
			const data: Array<KeyvStorageGetResult<Value>> = [];
			for (const value of values) {
				// @ts-expect-error = value is PromiseFulfilledResult<Value>
				data.push(value.value as KeyvStorageGetResult<Value>);
			}

			return data;
		}

		const connect = await this.connect;
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const cursor = connect.store
			.find({
				key: { $in: strippedKeys },
				namespace: { $eq: ns },
			})
			.project({ _id: 1, value: 1, key: 1, expiresAt: 1 });

		const now = new Date();
		const validMap = new Map<string, KeyvStorageGetResult<Value>>();
		// biome-ignore lint/suspicious/noExplicitAny: MongoDB ObjectId type
		const expiredIds: any[] = [];

		for await (const doc of cursor) {
			if (doc.expiresAt && new Date(doc.expiresAt as Date) <= now) {
				expiredIds.push(doc._id);
			} else {
				validMap.set(doc.key as string, doc.value as KeyvStorageGetResult<Value>);
			}
		}

		if (expiredIds.length > 0) {
			await connect.store.deleteMany({ _id: { $in: expiredIds } });
		}

		return strippedKeys.map((key) => validMap.get(key) as KeyvStorageGetResult<Value>);
	}

	/**
	 * Set a value in the store.
	 * @param key - The key to set.
	 * @param value - The value to store.
	 * @param ttl - Time to live in milliseconds. If specified, the key will expire after this duration.
	 * @returns `true` if the value was set, `false` if an error occurred.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public async set(key: string, value: any, ttl?: number): Promise<boolean> {
		try {
			const expiresAt = typeof ttl === "number" && ttl > 0 ? new Date(Date.now() + ttl) : null;
			const strippedKey = this.removeKeyPrefix(key);
			const ns = this.getNamespaceValue();
			const client = await this.connect;

			if (client.useGridFS) {
				const stream = client.bucket.openUploadStream(strippedKey, {
					metadata: {
						expiresAt,
						lastAccessed: new Date(),
						namespace: ns,
					},
				});

				return new Promise((resolve) => {
					stream.on("finish", () => {
						resolve(true);
					});
					/* v8 ignore start -- @preserve */
					stream.on("error", () => {
						resolve(false);
					});
					/* v8 ignore stop -- @preserve */
					stream.end(value);
				});
			}

			await client.store.updateOne(
				{ key: { $eq: strippedKey }, namespace: { $eq: ns } },
				{ $set: { key: strippedKey, value, namespace: ns, expiresAt } },
				{ upsert: true },
			);
			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Set multiple values in the store at once. In standard mode, uses a single `bulkWrite` operation.
	 * In GridFS mode, each entry is set individually in parallel.
	 * @template Value - The type of the stored values.
	 * @param entries - Array of entries to set. Each entry has a `key`, `value`, and optional `ttl` in milliseconds.
	 * @returns Array of booleans (one per entry) indicating which writes succeeded, in input order.
	 */
	public async setMany<Value>(entries: KeyvEntry<Value>[]): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return [];
		}

		if (this._useGridFS) {
			const settled = await Promise.allSettled(
				entries.map(async ({ key, value, ttl }) => this.set(key, value, ttl)),
			);
			return settled.map((result) => (result.status === "fulfilled" ? result.value : false));
		}

		const client = await this.connect;
		const ns = this.getNamespaceValue();
		const operations = entries.map(({ key, value, ttl }) => {
			const strippedKey = this.removeKeyPrefix(key);
			const expiresAt = typeof ttl === "number" && ttl > 0 ? new Date(Date.now() + ttl) : null;
			return {
				updateOne: {
					filter: { key: { $eq: strippedKey }, namespace: { $eq: ns } },
					update: {
						$set: { key: strippedKey, value, namespace: ns, expiresAt },
					},
					upsert: true,
				},
			};
		});

		try {
			await client.store.bulkWrite(operations, { ordered: false });
			return entries.map(() => true);
		} catch (error) {
			if (error instanceof MongoBulkWriteError) {
				const results = new Array<boolean>(entries.length).fill(true);
				/* v8 ignore next -- @preserve */
				const errors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
				for (const writeError of errors) {
					results[writeError.index] = false;
				}

				this.emit("error", error);
				return results;
			}

			this.emit("error", error);
			return entries.map(() => false);
		}
	}

	/**
	 * Delete a key from the store.
	 * @param key - The key to delete.
	 * @returns `true` if the key was deleted, `false` if the key was not found.
	 */
	public async delete(key: string): Promise<boolean> {
		if (typeof key !== "string") {
			return false;
		}

		const client = await this.connect;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (client.useGridFS) {
			try {
				const connection = client.db;
				const bucket = new GridFSBucket(connection, {
					bucketName: this._collection,
				});
				const files = await bucket
					.find({
						filename: { $eq: strippedKey },
						"metadata.namespace": { $eq: ns },
					})
					.toArray();
				if (files.length === 0) {
					return false;
				}

				await client.bucket.delete(files[0]._id);
				return true;
			} catch (error) {
				this.emit("error", error);
				return false;
			}
		}

		const object = await client.store.deleteOne({
			key: { $eq: strippedKey },
			namespace: { $eq: ns },
		});
		return object.deletedCount > 0;
	}

	/**
	 * Delete multiple keys from the store at once. Each key is deleted individually
	 * so that per-key success/failure information is preserved.
	 * @param keys - Array of keys to delete.
	 * @returns Array of booleans indicating whether each key was successfully deleted.
	 */
	public async deleteMany(keys: string[]): Promise<boolean[]> {
		const results = await Promise.all(keys.map(async (key) => this.delete(key)));
		return results;
	}

	/**
	 * Delete all keys in the current namespace.
	 * @returns A promise that resolves once the matching keys have been deleted.
	 */
	public async clear(): Promise<void> {
		const client = await this.connect;
		const ns = this.getNamespaceValue();

		if (client.useGridFS) {
			const connection = client.db;
			const bucket = new GridFSBucket(connection, {
				bucketName: this._collection,
			});
			const files = await bucket
				.find({
					"metadata.namespace": { $eq: ns },
				})
				.toArray();

			await Promise.all(files.map(async (file) => client.bucket.delete(file._id)));
			return;
		}

		await client.store.deleteMany({
			namespace: { $eq: ns },
		});
	}

	/**
	 * Remove all expired files from GridFS. This method only works in GridFS mode
	 * and is a no-op that returns `false` in standard mode.
	 * @returns `true` if running in GridFS mode, `false` otherwise.
	 */
	public async clearExpired(): Promise<boolean> {
		const client = await this.connect;
		if (!client.useGridFS) {
			return false;
		}

		const ns = this.getNamespaceValue();
		const bucket = new GridFSBucket(client.db, {
			bucketName: this._collection,
		});

		const expiredFiles = await bucket
			.find({
				"metadata.expiresAt": {
					$lte: new Date(Date.now()),
				},
				"metadata.namespace": { $eq: ns },
			})
			.toArray();

		await Promise.all(expiredFiles.map(async (file) => client.bucket.delete(file._id)));
		return true;
	}

	/**
	 * Remove all GridFS files that have not been accessed for the specified duration. This method only works
	 * in GridFS mode and is a no-op that returns `false` in standard mode.
	 * @param seconds - The number of seconds of inactivity after which files should be removed.
	 * @returns `true` if running in GridFS mode, `false` otherwise.
	 */
	public async clearUnusedFor(seconds: number): Promise<boolean> {
		const client = await this.connect;
		if (!client.useGridFS) {
			return false;
		}

		const ns = this.getNamespaceValue();
		const bucket = new GridFSBucket(client.db, {
			bucketName: this._collection,
		});

		const lastAccessedFiles = await bucket
			.find({
				"metadata.lastAccessed": {
					$lte: new Date(Date.now() - seconds * 1000),
				},
				"metadata.namespace": { $eq: ns },
			})
			.toArray();

		await Promise.all(lastAccessedFiles.map(async (file) => client.bucket.delete(file._id)));
		return true;
	}

	/**
	 * Iterate over all key-value pairs in the store matching the configured namespace.
	 * Expired entries are skipped and deleted as they are encountered.
	 * @yields A `[key, value]` pair for each non-expired entry.
	 * @returns An async generator of `[key, value]` pairs.
	 */
	public async *iterator() {
		const client = await this.connect;
		const namespaceValue = this.getNamespaceValue();

		if (client.useGridFS) {
			const now = new Date();
			const cursor = client.store.find({ "metadata.namespace": { $eq: namespaceValue } });

			for await (const file of cursor) {
				if (file.metadata?.expiresAt && new Date(file.metadata.expiresAt as Date) <= now) {
					await client.bucket.delete(file._id);
					continue;
				}

				const stream = client.bucket.openDownloadStream(file._id);
				const data = await new Promise<string | undefined>((resolve) => {
					const resp: Uint8Array[] = [];
					/* v8 ignore next -- @preserve */
					stream.on("error", () => {
						resolve(undefined);
					});
					stream.on("end", () => {
						resolve(Buffer.concat(resp).toString("utf8"));
					});
					stream.on("data", (chunk) => {
						resp.push(chunk as Uint8Array);
					});
				});
				yield [file.filename, data];
			}

			return;
		}

		const now = new Date();
		const cursor = client.store.find({ namespace: { $eq: namespaceValue } });

		for await (const doc of cursor) {
			if (doc.expiresAt && new Date(doc.expiresAt as Date) <= now) {
				await client.store.deleteOne({ _id: doc._id });
				continue;
			}

			yield [doc.key, doc.value];
		}
	}

	/**
	 * Check if a key exists in the store.
	 * @param key - The key to check.
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string): Promise<boolean> {
		const client = await this.connect;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			const document = await client.store.count({
				filename: { $eq: strippedKey },
				"metadata.namespace": { $eq: ns },
				$or: [{ "metadata.expiresAt": null }, { "metadata.expiresAt": { $gt: new Date() } }],
			});
			return document !== 0;
		}

		const document = await client.store.count({
			key: { $eq: strippedKey },
			namespace: { $eq: ns },
			$or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
		});
		return document !== 0;
	}

	/**
	 * Check if multiple keys exist in the store at once. Uses a single query with the `$in` operator.
	 * @param keys - Array of keys to check.
	 * @returns Array of booleans in the same order as the input keys.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		const client = await this.connect;
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			const files = await client.store
				.find({
					filename: { $in: strippedKeys },
					"metadata.namespace": { $eq: ns },
					$or: [{ "metadata.expiresAt": null }, { "metadata.expiresAt": { $gt: new Date() } }],
				})
				.project({ filename: 1 })
				.toArray();
			const existingKeys = new Set(files.map((f) => f.filename as string));
			return strippedKeys.map((key) => existingKeys.has(key));
		}

		const docs = await client.store
			.find({
				key: { $in: strippedKeys },
				namespace: { $eq: ns },
				$or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
			})
			.project({ key: 1 })
			.toArray();
		const existingKeys = new Set(docs.map((d) => d.key as string));
		return strippedKeys.map((key) => existingKeys.has(key));
	}

	/**
	 * Close the MongoDB connection.
	 * @returns A promise that resolves once the connection has been closed.
	 */
	public async disconnect(): Promise<void> {
		const client = await this.connect;
		await client.mongoClient.close();
	}

	/**
	 * Strips the namespace prefix from a key that was added by the Keyv core.
	 * For example, if namespace is "ns" and key is "ns:foo", returns "foo".
	 */
	private removeKeyPrefix(key: string): string {
		if (this._namespace && key.startsWith(`${this._namespace}:`)) {
			return key.slice(this._namespace.length + 1);
		}

		return key;
	}

	/**
	 * Returns the namespace value for query filters.
	 * Returns empty string when no namespace is set.
	 */
	private getNamespaceValue(): string {
		return this._namespace ?? "";
	}

	/**
	 * Extracts MongoDB driver options from the provided options, filtering out Keyv-specific properties.
	 */
	private extractMongoOptions(options: KeyvMongoOptions): MongoClientOptions {
		const keyvKeys = new Set([
			"url",
			"collection",
			"namespace",
			"serialize",
			"deserialize",
			"uri",
			"useGridFS",
			"db",
			"readPreference",
			"emitErrors",
		]);

		const mongoOptions: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(options)) {
			if (!keyvKeys.has(key)) {
				mongoOptions[key] = value;
			}
		}

		return mongoOptions as MongoClientOptions;
	}

	/**
	 * Initializes the MongoDB connection and sets up indexes. Connection or setup failures are
	 * emitted as an `error` event and re-thrown so that the `connect` promise rejects instead of
	 * hanging.
	 */
	private async initConnection(): Promise<KeyvMongoConnect> {
		try {
			const client = new mongoClient(this._url, this._mongoOptions);
			await client.connect();

			const database = client.db(this._db);

			if (this._useGridFS) {
				const bucket = new GridFSBucket(database, {
					readPreference: this._readPreference,
					bucketName: this._collection,
				});
				const store = database.collection(`${this._collection}.files`);

				await store.createIndex({ uploadDate: -1 });
				await store.createIndex({ "metadata.expiresAt": 1 });
				await store.createIndex({ "metadata.lastAccessed": 1 });
				await store.createIndex({ "metadata.filename": 1 });
				await store.createIndex({ "metadata.namespace": 1 });

				return {
					useGridFS: true,
					bucket,
					store,
					db: database,
					mongoClient: client,
				};
			}

			const store = database.collection(this._collection);

			// Migration: drop old single-field unique index on key
			try {
				await store.dropIndex("key_1");
			} catch {
				// Index doesn't exist or already dropped - safe to ignore
			}

			await store.createIndex({ key: 1, namespace: 1 }, { unique: true, background: true });
			await store.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });

			return { useGridFS: false, store, mongoClient: client };
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			throw error;
		}
		/* v8 ignore stop -- @preserve */
	}
}

/**
 * Helper function to create a Keyv instance with KeyvMongo as the storage adapter.
 * @param options - Optional {@link KeyvMongoOptions} configuration object or connection URI string.
 * @returns A new Keyv instance backed by MongoDB.
 */
export const createKeyv = (options?: KeyvMongoOptions | string) => {
	const store = new KeyvMongo(options);
	const namespace = typeof options === "object" ? options?.namespace : undefined;
	return new Keyv({ store, namespace });
};

export default KeyvMongo;
export type { KeyvMongoOptions } from "./types.js";
