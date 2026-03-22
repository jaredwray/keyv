import { Buffer } from "node:buffer";
import { deflate, inflate } from "pako";
import type { Options } from "./types.js";

export class KeyvGzip {
	opts: Options;
	constructor(options?: Options) {
		this.opts = {
			...options,
		};
	}

	async compress(
		value: pako.Data | string,
		options?: Options,
	): Promise<string> {
		const compressed = deflate(value, options || this.opts);
		return Buffer.from(compressed).toString("base64");
	}

	async decompress(value: string, options?: Options): Promise<string> {
		const buffer = Buffer.from(value, "base64");
		return inflate(buffer, { ...(options || this.opts), to: "string" });
	}
}

export default KeyvGzip;
