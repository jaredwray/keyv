import { Buffer } from "node:buffer";
import type { KeyvCompressionAdapter } from "keyv";
import { deflate, inflate } from "pako";
import type { Options } from "./types.js";

export class KeyvGzip implements KeyvCompressionAdapter {
	private readonly _options: Options;

	constructor(options?: Options) {
		this._options = { ...options };
	}

	async compress(value: string): Promise<string> {
		const compressed = deflate(value, this._options);
		return Buffer.from(compressed).toString("base64");
	}

	async decompress(value: string): Promise<string> {
		const buffer = Buffer.from(value, "base64");
		return inflate(buffer, { ...this._options, to: "string" });
	}
}

export default KeyvGzip;
