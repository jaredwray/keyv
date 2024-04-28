import type {BrotliOptions, InputType} from 'node:zlib';
import compressBrotli from 'compress-brotli';
import {defaultDeserialize, defaultSerialize} from '@keyv/serialize';
import type {
	Brotli, CompressResult, Options, SerializeResult, Serialize,
} from './types';

class KeyvBrotli {
	private readonly brotli: Brotli;
	constructor(options?: Options) {
		this.brotli = compressBrotli(options);
	}

	async compress(value: any, options?: BrotliOptions): CompressResult {
		return this.brotli.compress(value, options);
	}

	async decompress<T>(data: InputType, options?: BrotliOptions): Promise<T> {
		return await this.brotli.decompress(data, options) as T;
	}

	async serialize({value, expires}: Serialize): Promise<SerializeResult> {
		return defaultSerialize({value: await this.compress(value), expires});
	}

	async deserialize(data: CompressResult): Promise<Serialize> {
		const {value, expires}: Serialize = defaultDeserialize(data);
		return {value: await this.decompress(value), expires};
	}
}

export = KeyvBrotli;
