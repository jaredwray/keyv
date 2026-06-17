import type {
	Collection,
	Db,
	GridFSBucket,
	MongoClient,
	MongoClientOptions,
	ReadPreference,
} from "mongodb";

/**
 * Configuration options for the KeyvMongo adapter.
 * Extends `MongoClientOptions`, so any MongoDB driver option may also be provided.
 */
export type Options = {
	/**
	 * The MongoDB connection URI.
	 * @default 'mongodb://127.0.0.1:27017'
	 */
	url?: string;
	/**
	 * The collection name used for storage. In GridFS mode it is used as the bucket name.
	 * @default 'keyv'
	 */
	collection?: string;
	/**
	 * The namespace used to prefix keys for multi-tenant separation.
	 */
	namespace?: string;
	/**
	 * Whether to use GridFS for storing values.
	 * @default false
	 */
	useGridFS?: boolean;
	/**
	 * Alias for `url`. The MongoDB connection URI.
	 */
	uri?: string;
	/**
	 * The database name for the MongoDB connection. When undefined, the driver default is used.
	 */
	db?: string;
	/**
	 * The MongoDB read preference for GridFS operations.
	 */
	readPreference?: ReadPreference;
} & MongoClientOptions;

/**
 * Options accepted by the KeyvMongo constructor: either an {@link Options} object or a
 * MongoDB connection URI string.
 */
export type KeyvMongoOptions = Options | string;

/**
 * Fields common to every resolved KeyvMongo connection, regardless of mode.
 */
type KeyvMongoConnectBase = {
	/** The collection used for storage. In GridFS mode this is the `<collection>.files` collection. */
	store: Collection;
	/** The underlying MongoDB client instance. */
	mongoClient: MongoClient;
};

/**
 * Resolved connection details for standard (non-GridFS) mode.
 */
export type KeyvMongoConnectStandard = KeyvMongoConnectBase & {
	/** Discriminant: always `false` in standard mode. */
	useGridFS: false;
};

/**
 * Resolved connection details for GridFS mode, where `bucket` and `db` are always present.
 */
export type KeyvMongoConnectGridFS = KeyvMongoConnectBase & {
	/** Discriminant: always `true` in GridFS mode. */
	useGridFS: true;
	/** The GridFS bucket. */
	bucket: GridFSBucket;
	/** The database handle. */
	db: Db;
};

/**
 * The resolved MongoDB connection details produced once the adapter has connected.
 * Discriminated union: the `useGridFS` discriminant selects {@link KeyvMongoConnectStandard}
 * or {@link KeyvMongoConnectGridFS}.
 */
export type KeyvMongoConnect = KeyvMongoConnectStandard | KeyvMongoConnectGridFS;
