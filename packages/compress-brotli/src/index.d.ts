import type {InputType, BrotliOptions, CompressCallback} from 'node:zlib';
import type Brotli, {CompressResult} from 'compress-brotli';

declare class KeyvBrotli {
	brotli: Brotli;
	constructor(options?: KeyvBrotli.Options);
	async compress(value: InputType | number | boolean, options?: BrotliOptions);
	async decompress(value: InputType | number | boolean, options?: BrotliOptions);
	async serialize(value: any);
	async deserialize(value: any);
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
