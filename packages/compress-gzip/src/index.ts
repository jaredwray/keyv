import { Buffer } from "node:buffer";
import { defaultDeserialize, defaultSerialize } from "@keyv/serialize";
import { deflate, inflate } from "pako";
import type { Options, Serialize } from "./types.js";

export class KeyvGzip {
	opts: Options;
	constructor(options?: Options) {
		this.opts = {
			toText: true,
			...options,
		};
	}

	async compress(value: string | Uint8Array | ArrayBuffer, options?: Options) {
		// Wrap in a Buffer so serialization stores the compressed bytes as a
		// compact `:base64:` string instead of an index-keyed byte object.
		return Buffer.from(deflate(value, options || this.opts));
	}

	async decompress(
		value: Uint8Array | ArrayBuffer | Record<string, number>,
		options?: Options,
	) {
		return inflate(toInflateInput(value), {
			...(options || this.opts),
			toText: true,
		});
	}

	async serialize({ value, expires }: Serialize) {
		return defaultSerialize({ value: await this.compress(value), expires });
	}

	async deserialize(data: string) {
		/* v8 ignore next -- @preserve */
		if (data) {
			const { value, expires }: Serialize = defaultDeserialize(data);
			return {
				value: await this.decompress(
					value as Uint8Array | ArrayBuffer | Record<string, number>,
				),
				expires,
			};
		}

		/* v8 ignore next -- @preserve */
		return { value: undefined, expires: undefined };
	}
}

function toInflateInput(
	value: Uint8Array | ArrayBuffer | Record<string, number>,
): Uint8Array | ArrayBuffer {
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
		return value;
	}

	const keys = Object.keys(value);
	const bytes = new Uint8Array(keys.length);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i] as string;
		bytes[Number(key)] = value[key] as number;
	}

	return bytes;
}

export default KeyvGzip;
