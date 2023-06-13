/* eslint-disable @typescript-eslint/no-extraneous-class */

export type StorageAdapterType = {
	get<T>(key: string): Promise<T | undefined>;
	getMany?<T>(keys: string[]): Promise<Array<T | undefined>>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<boolean>;
	deleteMany?(keys: string[]): Promise<boolean[]>;
	clear(): Promise<void>;
	disconnect?(): Promise<void>;
};

export type StorageAdapterOrMapType = StorageAdapterType | Map<any, any>;

export type CompressionAdapterType = {
	compress(data: string): Promise<string>;
	decompress(data: string): Promise<string>;
};

export type KeyvOptionsType = {
	namespace?: string;
	ttl?: number;
	primaryStorage?: StorageAdapterOrMapType;
	uri?: string;
	compression?: CompressionAdapterType;
	secondaryStorage?: StorageAdapterOrMapType;
	offlineMode?: boolean;
    returnRaw?: boolean;
    serialize?: Function;
    deserialize?: Function;
    //legacy
    store?: StorageAdapterOrMapType;
    adapter?: StorageAdapterOrMapType;

};

export default class Keyv {
    private _options: KeyvOptionsType = {
        namespace: 'keyv',
        ttl: undefined,
        primaryStorage: new Map(),
        uri: undefined,
        compression: undefined,
        secondaryStorage: undefined,
        offlineMode: false,
    };

    constructor(options?: KeyvOptionsType) {
    }

    public get namespace(): string | undefined {
        return this._options.namespace;
    }
    public set namespace(value: string) {
        this._options.namespace = value;
    }

    public get ttl(): number | undefined{
        return this._options.ttl;
    }
    public set ttl(value: number) {
        this._options.ttl = value;
    }

}
