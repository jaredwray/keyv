/* eslint-disable @typescript-eslint/no-extraneous-class */
import { EventEmitter } from 'events';

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
	ttl?: number | undefined;
	primaryStorage?: StorageAdapterOrMapType;
	uri?: string;
	compression?: CompressionAdapterType | undefined;
	secondaryStorage?: StorageAdapterOrMapType | undefined;
	offlineMode?: boolean;
    serialize?: Function;
    deserialize?: Function;
    //legacy
    store?: StorageAdapterOrMapType;
    adapter?: StorageAdapterOrMapType;

};

export default class Keyv extends EventEmitter {
    private _options: KeyvOptionsType = {
        namespace: 'keyv',
        ttl: undefined,
        primaryStorage: new Map(),
        secondaryStorage: undefined,
        uri: undefined,
        compression: undefined,
        offlineMode: false,
    };

    constructor(args1: StorageAdapterOrMapType | string | KeyvOptionsType, options?: KeyvOptionsType) {
        super();
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

    public get primaryStorage(): StorageAdapterOrMapType | undefined {
        return this._options.primaryStorage;
    }
    public set primaryStorage(value: StorageAdapterOrMapType) {
        this._options.primaryStorage = value;
    }
    //legacy reference of store
    public get store(): StorageAdapterOrMapType | undefined {
        return this._options.primaryStorage;
    }
    public set store(value: StorageAdapterOrMapType) {
        this._options.primaryStorage = value;
    }
    public get secondaryStorage(): StorageAdapterOrMapType | undefined {
        return this._options.secondaryStorage;
    }
    public set secondaryStorage(value: StorageAdapterOrMapType) {
        this._options.secondaryStorage = value;
    }

    public get uri(): string | undefined {
        return this._options.uri;
    }
    public set uri(value: string) {
        this._options.uri = value;
    }

    public get compression(): CompressionAdapterType | undefined {
        return this._options.compression;
    }
    public set compression(value: CompressionAdapterType) {
        this._options.compression = value;
    }

    public get(key: string | string[]): Promise<any> {
        return Promise.resolve(undefined);
    }

    public set(key: string | string[], value: any, ttl?: number): Promise<any> {
        return Promise.resolve(undefined);
    }

    public delete(key: string | string[]): Promise<boolean> {
        return Promise.resolve(false);
    }

    public clear(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public disconnect(): Promise<void> {
        return Promise.resolve(undefined);
    }

    private serializeData(data: any): string {
        return '';
    }

    private deserializeData(data: string): any {
    }
}
