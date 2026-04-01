import { Buffer } from "node:buffer";
import { compress, uncompress } from "lz4-napi";

/**
 * LZ4 compression adapter used internally for testing the compression test suite.
 */
export class KeyvLz4TestAdapter {
	constructor(private readonly dictionary?: string) {}

	/** Compresses a string value using LZ4 and returns a base64-encoded result. */
	async compress(data: string): Promise<string> {
		const compressed = await compress(Buffer.from(data), this.getDictionary());
		return compressed.toString("base64");
	}

	/** Decompresses a base64-encoded LZ4 string back to its original value. */
	async decompress(data: string): Promise<string> {
		const buffer = Buffer.from(data, "base64");
		const value = await uncompress(buffer, this.getDictionary());
		return value.toString("utf8");
	}

	private getDictionary() {
		/* v8 ignore next -- @preserve */
		if (this.dictionary) {
			return Buffer.from(this.dictionary);
		}

		return undefined;
	}
}
