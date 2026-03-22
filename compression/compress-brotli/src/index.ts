import { promisify } from "node:util";
import {
	type BrotliOptions,
	brotliCompress,
	brotliDecompress,
} from "node:zlib";
import type { Options } from "./types.js";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

export class KeyvBrotli {
	private readonly _enable: boolean;
	private readonly _compressOptions?: BrotliOptions;
	private readonly _decompressOptions?: BrotliOptions;

	constructor(options?: Options) {
		this._enable = options?.enable ?? true;
		this._compressOptions = options?.compressOptions;
		this._decompressOptions = options?.decompressOptions;
	}

	// biome-ignore lint/suspicious/noExplicitAny: needed for this type
	async compress(value: any, options?: BrotliOptions): Promise<string> {
		if (!this._enable) {
			return typeof value === "string" ? value : JSON.stringify(value);
		}

		const input = typeof value === "string" ? value : JSON.stringify(value);
		const compressed = await brotliCompressAsync(input, {
			...this._compressOptions,
			...options,
		});
		return compressed.toString("base64");
	}

	async decompress<T>(data?: string, options?: BrotliOptions): Promise<T> {
		if (!data) {
			return undefined as unknown as T;
		}

		if (!this._enable) {
			return data as unknown as T;
		}

		const buffer = Buffer.from(data, "base64");
		const decompressedBuffer = await brotliDecompressAsync(buffer, {
			...this._decompressOptions,
			...options,
		});
		return decompressedBuffer.toString() as unknown as T;
	}
}

export default KeyvBrotli;
