import type Brotli, {BrotliOptions} from 'compress-brotli';

declare class KeyvBrotli {
	brotli: Brotli;
	opts: BrotliOptions;
	constructor(options?: BrotliOptions);
	async compress(value: any);
	async decompress(value: any);
	async serialize(value: any);
	async deserialize(value: any);
}

export = KeyvBrotli;
