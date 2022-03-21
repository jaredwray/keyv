import EventEmitter from 'node:events';

declare class Keyv extends EventEmitter {
	constructor(uri: string, options: Keyv.Options);
	get(key: string, options: any): Promise<any>;
	set(key: string, value: any, ttl: number): Promise<boolean>;
	delete(key: string): Promise<boolean>;
	clear(): Promise<void>;
	has(key: string): Promise<boolean>;
}

declare namespace Keyv {
	interface Options {
		namespace?: string | undefined;
		serialize?: ((data: any) => string) | undefined;
		deserialize?: ((data: string) => any | undefined) | undefined;
		ttl?: number | undefined;
	}
}

export = Keyv;
