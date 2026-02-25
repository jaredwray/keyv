import { Buffer } from "node:buffer";
import { Hookified } from "hookified";
import Keyv, { type KeyvStoreAdapter, type StoredData } from "keyv";
import {
	type Document,
	GridFSBucket,
	type MongoClientOptions,
	MongoClient as mongoClient,
	type ReadPreference,
	type WithId,
} from "mongodb";
import type { KeyvMongoConnect, KeyvMongoOptions, Options } from "./types.js";

/**
 * MongoDB storage adapter for Keyv.
 * Provides a persistent key-value store using MongoDB as the backend.
 */
export class KeyvMongo extends Hookified implements KeyvStoreAdapter {
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
	 * Promise that resolves to the MongoDB connection details.
	 */
	public connect: Promise<KeyvMongoConnect>;

	/**
	 * Get the MongoDB connection URI.
	 * @default 'mongodb://127.0.0.1:27017'
	 */
	public get url(): string {
		return this._url;
	}

	/**
	 * Set the MongoDB connection URI.
	 */
	public set url(value: string) {
		this._url = value;
	}

	/**
	 * Get the collection name used for storage.
	 * @default 'keyv'
	 */
	public get collection(): string {
		return this._collection;
	}

	/**
	 * Set the collection name used for storage.
	 */
	public set collection(value: string) {
		this._collection = value;
	}

	/**
	 * Get the namespace for the adapter. If undefined, no namespace prefix is applied.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get whether GridFS is used for storing values. This is read-only and can only be set via the constructor
	 * because the MongoDB connection shape differs between GridFS and standard modes.
	 * @default false
	 */
	public get useGridFS(): boolean {
		return this._useGridFS;
	}

	/**
	 * Get the database name for the MongoDB connection.
	 */
	public get db(): string | undefined {
		return this._db;
	}

	/**
	 * Set the database name for the MongoDB connection.
	 */
	public set db(value: string | undefined) {
		this._db = value;
	}

	/**
	 * Get the MongoDB read preference for GridFS operations.
	 */
	public get readPreference(): ReadPreference | undefined {
		return this._readPreference;
	}

	/**
	 * Set the MongoDB read preference for GridFS operations.
	 */
	public set readPreference(value: ReadPreference | undefined) {
		this._readPreference = value;
	}

	/**
	 * Get the options for the adapter. This is provided for backward compatibility.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get opts(): any {
		return {
			url: this._url,
			uri: this._url,
			collection: this._collection,
			useGridFS: this._useGridFS,
			db: this._db,
			readPreference: this._readPreference,
			dialect: "mongo",
			...this._mongoOptions,
		};
	}

	/**
	 * Creates a new KeyvMongo instance.
	 * @param url - Configuration options, connection URI string, or undefined for defaults.
	 * @param options - Additional configuration options that override the first parameter.
	 */
	constructor(url?: KeyvMongoOptions, options?: Options) {
		super();

		let mergedOptions: Options = {};

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
	private extractMongoOptions(options: Options): MongoClientOptions {
		const keyvKeys = new Set([
			"url",
			"collection",
			"namespace",
			"serialize",
			"deserialize",
			"uri",
			"useGridFS",
			"dialect",
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
	 * Initializes the MongoDB connection and sets up indexes.
	 */
	private initConnection(): Promise<KeyvMongoConnect> {
		// biome-ignore lint/suspicious/noAsyncPromiseExecutor: need to fix
		return new Promise(async (resolve, _reject) => {
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

					resolve({
						bucket,
						store,
						db: database,
						mongoClient: client,
					});
				} else {
					const store = database.collection(this._collection);

					// Migration: drop old single-field unique index on key
					try {
						await store.dropIndex("key_1");
					} catch {
						// Index doesn't exist or already dropped - safe to ignore
					}

					await store.createIndex(
						{ key: 1, namespace: 1 },
						{ unique: true, background: true },
					);
					await store.createIndex(
						{ expiresAt: 1 },
						{ expireAfterSeconds: 0, background: true },
					);

					resolve({ store, mongoClient: client });
				}
			} catch (error) {
				/* v8 ignore next -- @preserve */
				this.emit("error", error);
			}
		});
	}

	async get<Value>(key: string): Promise<StoredData<Value>> {
		const client = await this.connect;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			const file = await client.store.findOne({
				filename: { $eq: strippedKey },
				"metadata.namespace": { $eq: ns },
			});

			if (!file) {
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

			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const stream = client.bucket!.openDownloadStream(file._id);

			return new Promise((resolve) => {
				const resp: Uint8Array[] = [];
				/* v8 ignore next -- @preserve */
				stream.on("error", () => {
					resolve(undefined);
				});

				stream.on("end", () => {
					const data = Buffer.concat(resp).toString("utf8");
					resolve(data as StoredData<Value>);
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

		return document.value as StoredData<Value>;
	}

	async getMany<Value>(keys: string[]) {
		if (this._useGridFS) {
			const promises = [];
			for (const key of keys) {
				promises.push(this.get(key));
			}

			const values = await Promise.allSettled(promises);
			const data: Array<StoredData<Value>> = [];
			for (const value of values) {
				// @ts-expect-error = value is PromiseFulfilledResult<Value>
				data.push(value.value as StoredData<Value>);
			}

			return data;
		}

		const connect = await this.connect;
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const values: Array<{ key: string; value: StoredData<Value> }> =
			(await connect.store
				.find({ key: { $in: strippedKeys }, namespace: { $eq: ns } })
				.project({ _id: 0, value: 1, key: 1 })
				.toArray()) as Array<{ key: string; value: StoredData<Value> }>;

		const results: Array<StoredData<Value>> = [];
		for (const key of strippedKeys) {
			const rowIndex = values.findIndex(
				(row: { key: string; value: unknown }) => row.key === key,
			);

			results.push(
				rowIndex > -1
					? values[rowIndex].value
					: (undefined as StoredData<Value>),
			);
		}

		return results;
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number) {
		const expiresAt =
			typeof ttl === "number" ? new Date(Date.now() + ttl) : null;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			const client = await this.connect;
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const stream = client.bucket!.openUploadStream(strippedKey, {
				metadata: {
					expiresAt,
					lastAccessed: new Date(),
					namespace: ns,
				},
			});

			return new Promise((resolve) => {
				stream.on("finish", () => {
					resolve(stream);
				});
				stream.end(value);
			});
		}

		const client = await this.connect;
		await client.store.updateOne(
			{ key: { $eq: strippedKey }, namespace: { $eq: ns } },
			{ $set: { key: strippedKey, value, namespace: ns, expiresAt } },
			{ upsert: true },
		);
	}

	async delete(key: string) {
		if (typeof key !== "string") {
			return false;
		}

		const client = await this.connect;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			try {
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				const connection = client.db!;
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

				// biome-ignore lint/style/noNonNullAssertion: need to fix
				await client.bucket!.delete(files[0]._id);
				return true;
			} catch {
				return false;
			}
		}

		const object = await client.store.deleteOne({
			key: { $eq: strippedKey },
			namespace: { $eq: ns },
		});
		return object.deletedCount > 0;
	}

	async deleteMany(keys: string[]) {
		const client = await this.connect;
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const connection = client.db!;
			const bucket = new GridFSBucket(connection, {
				bucketName: this._collection,
			});
			const files = await bucket
				.find({
					filename: { $in: strippedKeys },
					"metadata.namespace": { $eq: ns },
				})
				.toArray();
			if (files.length === 0) {
				return false;
			}

			await Promise.all(
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				files.map(async (file) => client.bucket!.delete(file._id)),
			);
			return true;
		}

		const object = await client.store.deleteMany({
			key: { $in: strippedKeys },
			namespace: { $eq: ns },
		});
		return object.deletedCount > 0;
	}

	async clear() {
		const client = await this.connect;
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const connection = client.db!;
			const bucket = new GridFSBucket(connection, {
				bucketName: this._collection,
			});
			const files = await bucket
				.find({
					"metadata.namespace": { $eq: ns },
				})
				.toArray();

			await Promise.all(
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				files.map(async (file) => client.bucket!.delete(file._id)),
			);
			return;
		}

		await client.store.deleteMany({
			namespace: { $eq: ns },
		});
	}

	async clearExpired(): Promise<boolean> {
		if (!this._useGridFS) {
			return false;
		}

		const ns = this.getNamespaceValue();

		return this.connect.then(async (client) => {
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const connection = client.db!;
			const bucket = new GridFSBucket(connection, {
				bucketName: this._collection,
			});

			return bucket
				.find({
					"metadata.expiresAt": {
						$lte: new Date(Date.now()),
					},
					"metadata.namespace": { $eq: ns },
				})
				.toArray()
				.then(async (expiredFiles) =>
					Promise.all(
						// biome-ignore lint/style/noNonNullAssertion: need to fix
						expiredFiles.map(async (file) => client.bucket!.delete(file._id)),
					).then(() => true),
				);
		});
	}

	async clearUnusedFor(seconds: number): Promise<boolean> {
		if (!this._useGridFS) {
			return false;
		}

		const ns = this.getNamespaceValue();
		const client = await this.connect;
		// biome-ignore lint/style/noNonNullAssertion: need to fix
		const connection = client.db!;
		const bucket = new GridFSBucket(connection, {
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

		await Promise.all(
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			lastAccessedFiles.map(async (file) => client.bucket!.delete(file._id)),
		);
		return true;
	}

	async *iterator(namespace?: string) {
		const client = await this.connect;
		const namespaceValue = namespace ?? "";

		if (this._useGridFS) {
			const gridIterator = client.store
				.find({ "metadata.namespace": { $eq: namespaceValue } })
				.map(async (x: WithId<Document>) => {
					const prefixedKey = namespace
						? `${namespace}:${x.filename}`
						: x.filename;
					// biome-ignore lint/style/noNonNullAssertion: need to fix
					const stream = client.bucket!.openDownloadStream(x._id);
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
					return [prefixedKey, data];
				});
			yield* gridIterator;
			return;
		}

		const iterator = client.store
			.find({ namespace: { $eq: namespaceValue } })
			.map((x: WithId<Document>) => {
				const prefixedKey = namespace ? `${namespace}:${x.key}` : x.key;
				return [prefixedKey, x.value];
			});

		yield* iterator;
	}

	async has(key: string) {
		const client = await this.connect;
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();

		if (this._useGridFS) {
			const document = await client.store.count({
				filename: { $eq: strippedKey },
				"metadata.namespace": { $eq: ns },
			});
			return document !== 0;
		}

		const document = await client.store.count({
			key: { $eq: strippedKey },
			namespace: { $eq: ns },
		});
		return document !== 0;
	}

	async disconnect(): Promise<void> {
		const client = await this.connect;
		await client.mongoClient.close();
	}
}

/**
 * Helper function to create a Keyv instance with KeyvMongo as the storage adapter.
 * @param options - Optional {@link KeyvMongoOptions} configuration object or connection URI string.
 * @returns A new Keyv instance backed by MongoDB.
 */
export const createKeyv = (options?: KeyvMongoOptions) => {
	const store = new KeyvMongo(options);
	const namespace =
		typeof options === "object" ? options?.namespace : undefined;
	return new Keyv({ store, namespace });
};

export default KeyvMongo;
export type { KeyvMongoOptions } from "./types.js";
