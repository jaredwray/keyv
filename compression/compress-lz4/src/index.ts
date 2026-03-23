import { Buffer } from "node:buffer";
import type { KeyvCompressionAdapter } from "keyv";
import { compress, uncompress } from "lz4-napi";

export class KeyvLz4 implements KeyvCompressionAdapter {
	constructor(private readonly dictionary?: string) {}

	async compress(data: string): Promise<string> {
		const compressed = await compress(Buffer.from(data), this.getDictionary());
		return compressed.toString("base64");
	}

	async decompress(data: string): Promise<string> {
		const buffer = Buffer.from(data, "base64");
		const value = await uncompress(buffer, this.getDictionary());
		return value.toString("utf8");
	}

	private getDictionary() {
		if (this.dictionary) {
			return Buffer.from(this.dictionary);
		}

		return undefined;
	}
}

export default KeyvLz4;
