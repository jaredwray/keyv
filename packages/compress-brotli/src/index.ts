import type {BrotliOptions, InputType} from 'node:zlib';
import compressBrotli from 'compress-brotli';
import type {
	Options,
	Brotli,
	SerializeResult,
	DeserializeResult,
	CompressResult,
	SerializeInput,
} from './types';

class KeyvBrotli {
	private readonly brotli: Brotli;
	constructor(options?: Options) {
		this.brotli = compressBrotli(options);
	}

	async compress(value: any, options?: BrotliOptions): Promise<CompressResult> {
		return this.brotli.compress(value, options);
	}

	async decompress(data: InputType, options?: BrotliOptions): Promise<DeserializeResult> {
		return this.brotli.decompress(data, options);
	}

	async serialize({value, expires}: SerializeInput): Promise<SerializeResult> {
		const compressValue = await this.compress(value);
		// @ts-expect-error - `expires` is not part of the `SerializeResult` type
		return this.brotli.serialize({value: compressValue, expires});
	}

	async deserialize(data: CompressResult): Promise<DeserializeResult> {
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		if (!data) {
			return data;
		}

		const {value, expires} = this.brotli.deserialize(data);
		return {value: await this.decompress(value), expires};
	}
}
export default KeyvBrotli;
