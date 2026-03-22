import { deflate, inflate } from "pako";
import type { Options } from "./types.js";

export class KeyvGzip {
	opts: Options;
	constructor(options?: Options) {
		this.opts = {
			to: "string",
			...options,
		};
	}

	async compress(value: pako.Data | string, options?: Options) {
		return deflate(value, options || this.opts);
	}

	async decompress(value: pako.Data, options?: Options) {
		if (options) {
			options.to = "string";
		}

		return inflate(value, options || this.opts);
	}
}

export default KeyvGzip;
