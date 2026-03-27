import { promisify } from "node:util";
import { type BrotliOptions, brotliCompress, brotliDecompress } from "node:zlib";
import type { KeyvCompressionAdapter } from "keyv";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

export type Options = {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
};

export class KeyvBrotli implements KeyvCompressionAdapter {
	private readonly _compressOptions?: BrotliOptions;
	private readonly _decompressOptions?: BrotliOptions;

	constructor(options?: Options) {
		this._compressOptions = options?.compressOptions;
		this._decompressOptions = options?.decompressOptions;
	}

	async compress(value: string): Promise<string> {
		const compressed = await brotliCompressAsync(value, {
			...this._compressOptions,
		});
		return compressed.toString("base64");
	}

	async decompress(value: string): Promise<string> {
		const buffer = Buffer.from(value, "base64");
		const decompressed = await brotliDecompressAsync(buffer, {
			...this._decompressOptions,
		});
		return decompressed.toString();
	}
}

export default KeyvBrotli;
