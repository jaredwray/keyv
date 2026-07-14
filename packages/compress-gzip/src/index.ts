import { Buffer } from "node:buffer";
import { defaultDeserialize, defaultSerialize } from "@keyv/serialize";
import { deflate, inflate } from "pako";
import type { Options, Serialize } from "./types.js";

export class KeyvGzip {
	opts: Options;
	constructor(options?: Options) {
		this.opts = {
			to: "string",
			...options,
		};
	}

	async compress(value: pako.Data | string, options?: Options) {
		// Wrap in a Buffer so serialization stores the compressed bytes as a
		// compact `:base64:` string instead of an index-keyed byte object.
		return Buffer.from(deflate(value, options || this.opts));
	}

	async decompress(value: pako.Data, options?: Options) {
		if (options) {
			options.to = "string";
		}

		return inflate(value, options || this.opts);
	}

	async serialize({ value, expires }: Serialize) {
		return defaultSerialize({ value: await this.compress(value), expires });
	}

	async deserialize(data: string) {
		/* v8 ignore next -- @preserve */
		if (data) {
			const { value, expires }: Serialize = defaultDeserialize(data);
			return { value: await this.decompress(value as pako.Data), expires };
		}

		/* v8 ignore next -- @preserve */
		return { value: undefined, expires: undefined };
	}
}

export default KeyvGzip;
