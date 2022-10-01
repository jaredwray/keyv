import {EventEmitter} from 'node:events';
import {Store, StoredData} from 'keyv';

declare class KeyvGzip extends EventEmitter {
	ttlSupport: any;
	opts: any;
	constructor(options?: string | KeyvGzip.Options);
	compress(value: Value);
	decompress(value: Value);
}

declare namespace KeyvGzip {
	interface Options {
		compress: (...args: any[]) => void;
		decompress: (...args: any[]) => void;
	}
}

export = KeyvGzip;
