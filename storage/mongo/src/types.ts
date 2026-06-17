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
 * The resolved MongoDB connection details produced once the adapter has connected.
 */
export type KeyvMongoConnect = {
	/** The GridFS bucket. Present only when `useGridFS` is enabled. */
	bucket?: GridFSBucket;
	/** The collection used for storage. In GridFS mode this is the `<collection>.files` collection. */
	store: Collection;
	/** The database handle. Present only when `useGridFS` is enabled. */
	db?: Db;
	/** The underlying MongoDB client instance. */
	mongoClient: MongoClient;
};
