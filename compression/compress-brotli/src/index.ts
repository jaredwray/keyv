import type { BrotliOptions, InputType } from "node:zlib";
import { defaultDeserialize, defaultSerialize } from "@keyv/serialize";
import compressBrotli from "compress-brotli";
import type {
	Brotli,
	CompressResult,
	Options,
	Serialize,
	SerializeResult,
} from "./types.js";

export class KeyvBrotli {
	private readonly brotli: Brotli;
	constructor(options?: Options) {
		this.brotli = compressBrotli(options);
	}

	// biome-ignore lint/suspicious/noExplicitAny: needed for this type
	async compress(value: any, options?: BrotliOptions): CompressResult {
		return this.brotli.compress(value, options);
	}

	async decompress<T>(data?: InputType, options?: BrotliOptions): Promise<T> {
		if (data) {
			return (await this.brotli.decompress(data, options)) as T;
		}

		return undefined as unknown as T;
	}

	async serialize({ value, expires }: Serialize): Promise<SerializeResult> {
		return defaultSerialize({ value: await this.compress(value), expires });
	}

	async deserialize(data?: CompressResult): Promise<Serialize> {
		if (data) {
			const { value, expires }: Serialize = defaultDeserialize(data);
			return { value: await this.decompress(value), expires };
		}

		return { value: undefined, expires: undefined };
	}
}

export default KeyvBrotli;
