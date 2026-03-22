import { Buffer } from "node:buffer";
import { compress, uncompress } from "lz4-napi";

export class CompressionAdapter {
	constructor(private readonly dictionary?: string) {}

	async compress(data: string): Promise<Uint8Array> {
		return compress(Buffer.from(data), this.getDictionary());
	}

	async decompress(data: Uint8Array): Promise<string> {
		const value = await uncompress(Buffer.from(data), this.getDictionary());

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
