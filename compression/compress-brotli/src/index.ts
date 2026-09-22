import { promisify } from "node:util";
import { type BrotliOptions, brotliCompress, brotliDecompress } from "node:zlib";
import type { KeyvCompressionAdapter } from "keyv";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

export type Options = {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
};

/** The JSON envelope that Keyv v5 stored around a compressed value. */
type V5Envelope = { value?: unknown; expires?: number };

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
		// v6 stores base64, which never starts with "{". A JSON envelope was written by Keyv v5.
		if (value.startsWith("{")) {
			return this.decompressV5(value);
		}

		const buffer = Buffer.from(value, "base64");
		const decompressed = await brotliDecompressAsync(buffer, {
			...this._decompressOptions,
		});
		return decompressed.toString();
	}

	/**
	 * Reads a value written by Keyv v5 with @keyv/compress-brotli v2. v5 compressed only the value,
	 * serialized as JSON, and stored it in a JSON envelope:
	 * `{"value":":base64:<brotli>","expires":1700000000000}`. Returns the envelope Keyv v6 writes
	 * before compressing, so values stored before the upgrade stay readable.
	 */
	private async decompressV5(stored: string): Promise<string> {
		const { value, expires } = JSON.parse(stored) as V5Envelope;
		// v5 stored no value at all when it was set to undefined.
		if (value === undefined) {
			return JSON.stringify({ expires });
		}

		if (typeof value !== "string" || !value.startsWith(":base64:")) {
			throw new TypeError("Unrecognized compressed value: expected a Keyv v5 brotli value");
		}

		const json = await brotliDecompressAsync(Buffer.from(value.slice(8), "base64"), {
			...this._decompressOptions,
		});
		// v5 serialized the value with json-buffer, which tags buffers and escapes leading colons
		// the way Keyv's JSON serializer does, so the parsed JSON goes into the envelope unchanged.
		return JSON.stringify({ value: JSON.parse(json.toString()), expires });
	}
}

export default KeyvBrotli;
