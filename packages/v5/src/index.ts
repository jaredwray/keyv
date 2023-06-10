/* eslint-disable @typescript-eslint/no-extraneous-class */

type StorageAdapterType = {
	get<T>(key: string): Promise<T | undefined>;
	getMany(keys: string[]): Promise<Array<string | undefined>>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<boolean>;
	deleteMany(keys: string[]): Promise<boolean[]>;
	clear(): Promise<void>;
	disconnect?(): Promise<void>;
};

type CompressionAdapterType = {
	compress(data: string): Promise<string>;
	decompress(data: string): Promise<string>;
};

type KeyvOptionsType = {
	namespace?: string;
	ttl?: number;
	adapter?: StorageAdapterType;
	uri?: string;
	compression?: CompressionAdapterType;
	secondaryAdapter?: StorageAdapterType;
	offlineMode?: boolean;
};

class Keyv {}

export = Keyv;
