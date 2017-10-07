declare class Keyv {

    constructor(uri: string, opts?: Object);
    constructor(opts?: Object);

    get(key: string): any;

    set(key: string, value: any, ttl?: number): any;

    delete(key: string): void;

    clear(): undefined;
}