import {EventEmitter} from 'events';

declare class KeyvMemcache extends EventEmitter {
    ttlSupport: boolean;
    opts: any;
    client: any;
    constructor(uri: string, opts: KeyvMemcache.Options);
    _getNamespace(): string;
    get(key: string): Promise<string | undefined>;
    getMany(keys: string[]): Promise<string[] | undefined>;
    set(key: string, value: string | undefined): Promise<any>;
    delete(key: string): boolean;
    deleteMany(keys: string[]): boolean;
    clear(): Promise<void>;
    iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
    has(key: string): boolean;
    formatKey(key: any): any;
}

declare namespace KeyvMemcache {
    interface Options {
        url?: string | undefined;
        uri?: string | undefined;
    }
}

export = KeyvMemcache;
