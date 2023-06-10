/* eslint-disable @typescript-eslint/no-extraneous-class */

interface IStorageAdapter {
    get(key: string): Promise<string | undefined>;
    getMany(keys: string[]): Promise<(string | undefined)[]>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<boolean>;
    clear(): Promise<void>;
}

interface ICompressionAdapter {
    compress(data: string): Promise<string>;
    decompress(data: string): Promise<string>;
}

interface IKeyvOptions {
    namespace?:  Function | string;
    ttl?: number;
    adapter?: IStorageAdapter;
    uri?: string;
    compression?: ICompressionAdapter;
    secondaryAdapter?: IStorageAdapter;
    offlineMode?: boolean;
}

class Keyv {}

export = Keyv;
