import type {BrotliOptions, InputType} from 'node:zlib';
import compressBrotli from 'compress-brotli';
import type {Brotli, CompressResult, Options, SerializeResult} from './types';
import {Serialize} from './types';

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
		const compressValue = await this.compress(value);
		// @ts-expect-error - `expires` is not part of the `SerializeResult` type
		return this.brotli.serialize({value: compressValue, expires});
	}

	async deserialize(data: CompressResult): Promise<Serialize> {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		if (!data) {
			return data;
		}

		const {value, expires} = this.brotli.deserialize(data) as Serialize;
		return {value: await this.decompress(value), expires};
	}
}
export default KeyvBrotli;
