import type {
	Collection,
	Db,
	GridFSBucket,
	MongoClient,
	MongoClientOptions,
	ReadPreference,
} from "mongodb";

export type Options = {
	url?: string;
	collection?: string;
	namespace?: string;
	useGridFS?: boolean;
	uri?: string;
	db?: string;
	readPreference?: ReadPreference;
} & MongoClientOptions;

export type KeyvMongoOptions = Options | string;

export type KeyvMongoConnect = {
	bucket?: GridFSBucket;
	store: Collection;
	db?: Db;
	mongoClient: MongoClient;
};
