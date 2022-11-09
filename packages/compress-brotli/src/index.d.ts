import type {InputType, BrotliOptions, CompressCallback} from 'node:zlib';
import type Brotli, {CompressResult} from 'compress-brotli';

declare class KeyvBrotli {
	brotli: Brotli;
	constructor(options?: KeyvBrotli.Options);
	compress(value: InputType | number | boolean, options?: BrotliOptions): Promise<any>;
	decompress(value: InputType | number | boolean, options?: BrotliOptions): Promise<any>;
	serialize(value: any): Promise<any>;
	deserialize(value: any): Promise<any>;
}

declare namespace KeyvBrotli {
	interface Options {
		compressOptions?: BrotliOptions;
		decompressOptions?: BrotliOptions;
		enable?: boolean;
		serialize?: any;
		deserialize?: any;
		iltorb?: any;
	}
}

export = KeyvBrotli;
