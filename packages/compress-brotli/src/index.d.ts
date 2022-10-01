import {EventEmitter} from 'node:events';
import {Store, StoredData} from 'keyv';

declare class KeyvBrotli extends EventEmitter implements Store<Value> {
	ttlSupport: any;
	opts: any;
	constructor(options?: string | KeyvBrotli.Options);
	compress(value: Value);
	decompress(value: Value);
}

declare namespace KeyvBrotli {
	interface Options {
		compress: (...args: any[]) => void;
		decompress: (...args: any[]) => void;
	}
}

export = KeyvBrotli;
