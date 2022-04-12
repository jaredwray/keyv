import {EventEmitter} from 'events';
import { Store } from 'keyv';

declare class KeyvMemcache extends EventEmitter implements Store<TValue> {
    ttlSupport: boolean;
    namespace?: string | undefined;

    constructor(uri?: string)
    constructor(opts?: KeyvMemcache.Options);

    get(key: string): Promise<TValue | undefined>;
    getMany(keys: string[]): Promise<TValue[] | undefined>;
    set(key: string, value: TValue | undefined): Promise<any>;
    delete(key: string): boolean;
    deleteMany(keys: string[]): boolean;
    clear(): Promise<void>;
    iterator(namespace: string | undefined): AsyncGenerator<any, void, any>;
    has(key: string): boolean;
}

declare namespace KeyvMemcache {
    interface Options {
        url?: string | undefined;
        uri?: string | undefined;
    }
}

export = KeyvMemcache;
