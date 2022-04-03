import {EventEmitter} from 'events';

declare class Keyv<T = any> extends EventEmitter {
	constructor(uri: string, options: Keyv.Options);
	get(key: string, options?: any): Promise<T>;
	set(key: string, value: T, ttl?: number): Promise<boolean>;
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

	type Store<T> = Keyv<T>;
}

export = Keyv;
