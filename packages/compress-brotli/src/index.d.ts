import type Brotli, {BrotliOptions} from 'compress-brotli';

declare class KeyvBrotli {
	brotli: Brotli;
	opts: BrotliOptions;
	constructor(options?: BrotliOptions);
	compress(value: any);
	decompress(value: any);
	serialize(value: any);
	deserialize(value: any);
}

export = KeyvBrotli;
