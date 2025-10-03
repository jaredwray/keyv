import { Buffer } from "node:buffer";
import EventEmitter from "node:events";
import type { KeyvStoreAdapter, StoredData } from "keyv";
import {
	type Document,
	GridFSBucket,
	MongoServerError,
	MongoClient as mongoClient,
	type WithId,
} from "mongodb";
import type { KeyvMongoConnect, KeyvMongoOptions, Options } from "./types.js";

const keyvMongoKeys = new Set([
	"url",
	"collection",
	"namespace",
	"serialize",
	"deserialize",
	"uri",
	"useGridFS",
	"dialect",
	"db",
]);
export class KeyvMongo extends EventEmitter implements KeyvStoreAdapter {
	ttlSupport = false;
	opts: Options;
	connect: Promise<KeyvMongoConnect>;
	namespace?: string;

	constructor(url?: KeyvMongoOptions, options?: Options) {
		super();
		url ??= {};
		if (typeof url === "string") {
			url = { url };
		}

		if (url.uri) {
			url = { url: url.uri, ...url };
		}

		this.opts = {
			url: "mongodb://127.0.0.1:27017",
			collection: "keyv",
			...url,
			...options,
		};

		delete this.opts.emitErrors;

		const mongoOptions = Object.fromEntries(
			Object.entries(this.opts).filter(([k]) => !keyvMongoKeys.has(k)),
		);

		this.opts = Object.fromEntries(
			Object.entries(this.opts).filter(([k]) => keyvMongoKeys.has(k)),
		);

		// biome-ignore lint/suspicious/noAsyncPromiseExecutor: need to fix
		this.connect = new Promise(async (resolve, _reject) => {
			try {
				let url = "";
				if (this.opts.url) {
					url = this.opts.url;
				}

				const client = new mongoClient(url, mongoOptions);
				await client.connect();

				const database = client.db(this.opts.db);

				if (this.opts.useGridFS) {
					const bucket = new GridFSBucket(database, {
						readPreference: this.opts.readPreference,
						bucketName: this.opts.collection,
					});
					const store = database.collection(`${this.opts.collection}.files`);

					await store.createIndex({ uploadDate: -1 });
					await store.createIndex({ "metadata.expiresAt": 1 });
					await store.createIndex({ "metadata.lastAccessed": 1 });
					await store.createIndex({ "metadata.filename": 1 });

					resolve({
						bucket,
						store,
						db: database,
						mongoClient: client,
					});
				} else {
					let collection = "keyv";
					if (this.opts.collection) {
						collection = this.opts.collection;
					}

					const store = database.collection(collection);

					await store.createIndex(
						{ key: 1 },
						{ unique: true, background: true },
					);
					await store.createIndex(
						{ expiresAt: 1 },
						{ expireAfterSeconds: 0, background: true },
					);

					resolve({ store, mongoClient: client });
				}
			} catch (error) {
				/* c8 ignore next 4 */
				this.emit("error", error);
			}
		});
	}

	async get<Value>(key: string): Promise<StoredData<Value>> {
		const client = await this.connect;

		if (this.opts.useGridFS) {
			await client.store.updateOne(
				{
					filename: String(key),
				},
				{
					$set: {
						"metadata.lastAccessed": new Date(),
					},
				},
			);

			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const stream = client.bucket!.openDownloadStreamByName(key);

			return new Promise((resolve) => {
				const resp: Uint8Array[] = [];
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

		const document = await client.store.findOne({ key: { $eq: key } });

		if (!document) {
			return undefined;
		}

		return document.value as StoredData<Value>;
	}

	async getMany<Value>(keys: string[]) {
		if (this.opts.useGridFS) {
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
		const values: Array<{ key: string; value: StoredData<Value> }> =
			// @ts-expect-error need to fix this `s`
			await connect.store.s.db
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				.collection(this.opts.collection!)
				.find({ key: { $in: keys } })
				.project({ _id: 0, value: 1, key: 1 })
				.toArray();

		const results = [...keys];
		let i = 0;
		for (const key of keys) {
			const rowIndex = values.findIndex(
				(row: { key: string; value: unknown }) => row.key === key,
			);

			// @ts-expect-error - results type
			results[i] = rowIndex > -1 ? values[rowIndex].value : undefined;

			i++;
		}

		return results as Array<StoredData<Value>>;
	}

	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any, ttl?: number) {
		const expiresAt =
			typeof ttl === "number" ? new Date(Date.now() + ttl) : null;

		if (this.opts.useGridFS) {
			const client = await this.connect;
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const stream = client.bucket!.openUploadStream(key, {
				metadata: {
					expiresAt,
					lastAccessed: new Date(),
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
			{ key: { $eq: key } },
			{ $set: { key, value, expiresAt } },
			{ upsert: true },
		);
	}

	async delete(key: string) {
		if (typeof key !== "string") {
			return false;
		}

		const client = await this.connect;

		if (this.opts.useGridFS) {
			try {
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				const connection = client.db!;
				const bucket = new GridFSBucket(connection, {
					bucketName: this.opts.collection,
				});
				const files = await bucket.find({ filename: key }).toArray();
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				await client.bucket!.delete(files[0]._id);
				return true;
			} catch {
				return false;
			}
		}

		const object = await client.store.deleteOne({ key: { $eq: key } });
		return object.deletedCount > 0;
	}

	async deleteMany(keys: string[]) {
		const client = await this.connect;
		if (this.opts.useGridFS) {
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const connection = client.db!;
			const bucket = new GridFSBucket(connection, {
				bucketName: this.opts.collection,
			});
			const files = await bucket.find({ filename: { $in: keys } }).toArray();
			if (files.length === 0) {
				return false;
			}

			await Promise.all(
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				files.map(async (file) => client.bucket!.delete(file._id)),
			);
			return true;
		}

		const object = await client.store.deleteMany({ key: { $in: keys } });
		return object.deletedCount > 0;
	}

	async clear() {
		const client = await this.connect;
		if (this.opts.useGridFS) {
			try {
				// biome-ignore lint/style/noNonNullAssertion: need to fix
				await client.bucket!.drop();
			} catch (error: unknown) {
				/* c8 ignore next 5 */
				// Throw error if not "namespace not found" error
				if (!(error instanceof MongoServerError && error.code === 26)) {
					throw error;
				}
			}
		}

		await client.store.deleteMany({
			key: { $regex: this.namespace ? `^${this.namespace}:*` : "" },
		});
	}

	async clearExpired(): Promise<boolean> {
		if (!this.opts.useGridFS) {
			return false;
		}

		return this.connect.then(async (client) => {
			// biome-ignore lint/style/noNonNullAssertion: need to fix
			const connection = client.db!;
			const bucket = new GridFSBucket(connection, {
				bucketName: this.opts.collection,
			});

			return bucket
				.find({
					"metadata.expiresAt": {
						$lte: new Date(Date.now()),
					},
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
		if (!this.opts.useGridFS) {
			return false;
		}

		const client = await this.connect;
		// biome-ignore lint/style/noNonNullAssertion: need to fix
		const connection = client.db!;
		const bucket = new GridFSBucket(connection, {
			bucketName: this.opts.collection,
		});

		const lastAccessedFiles = await bucket
			.find({
				"metadata.lastAccessed": {
					$lte: new Date(Date.now() - seconds * 1000),
				},
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
		// biome-ignore lint/style/useTemplate: need to fix
		const regexp = new RegExp(`^${namespace ? namespace + ":" : ".*"}`);
		const iterator = this.opts.useGridFS
			? client.store
					.find({
						filename: regexp,
					})
					.map(async (x: WithId<Document>) => [
						x.filename,
						await this.get(x.filename),
					])
			: client.store
					.find({
						key: regexp,
					})
					.map((x: WithId<Document>) => [x.key, x.value]);

		yield* iterator;
	}

	async has(key: string) {
		const client = await this.connect;
		const filter = { [this.opts.useGridFS ? "filename" : "key"]: { $eq: key } };
		const document = await client.store.count(filter);
		return document !== 0;
	}

	async disconnect(): Promise<void> {
		const client = await this.connect;
		await client.mongoClient.close();
	}
}

export default KeyvMongo;
export type { KeyvMongoOptions } from "./types.js";
