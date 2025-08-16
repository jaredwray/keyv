// biome-ignore-all lint/suspicious/noExplicitAny: type format
import type {
	Collection,
	Db,
	GridFSBucket,
	MongoClient,
	ReadPreference,
} from "mongodb";

export type Options = {
	[key: string]: unknown;
	url?: string | undefined;
	collection?: string;
	namespace?: string;
	serialize?: any;
	deserialize?: any;
	useGridFS?: boolean;
	uri?: string;
	dialect?: string;
	db?: string;
	readPreference?: ReadPreference;
};

export type KeyvMongoOptions = Options | string;

export type KeyvMongoConnect = {
	bucket?: GridFSBucket;
	store: Collection;
	db?: Db;
	mongoClient: MongoClient;
};

export type PifyFunction = (...arguments_: any[]) => any;
