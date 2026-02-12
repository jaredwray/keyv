import { promisify } from "node:util";
import {
	type BrotliOptions,
	brotliCompress,
	brotliDecompress,
	type InputType,
} from "node:zlib";
import { defaultDeserialize, defaultSerialize } from "@keyv/serialize";
import type {
	CompressResult,
	Options,
	Serialize,
	SerializeResult,
} from "./types.js";

const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

export class KeyvBrotli {
	private readonly _enable: boolean;
	private readonly _compressOptions?: BrotliOptions;
	private readonly _decompressOptions?: BrotliOptions;
	// biome-ignore lint/suspicious/noExplicitAny: needed for custom serializers like v8
	private readonly _serialize: (value: any) => any;
	// biome-ignore lint/suspicious/noExplicitAny: needed for custom serializers like v8
	private readonly _deserialize: (data: any) => any;

	constructor(options?: Options) {
		this._enable = options?.enable ?? true;
		this._compressOptions = options?.compressOptions;
		this._decompressOptions = options?.decompressOptions;
		this._serialize = options?.serialize ?? defaultSerialize;
		this._deserialize = options?.deserialize ?? defaultDeserialize;
	}

	// biome-ignore lint/suspicious/noExplicitAny: needed for this type
	async compress(value: any, options?: BrotliOptions): CompressResult {
		if (!this._enable) {
			return value;
		}

		const serializedData = this._serialize(value);
		return brotliCompressAsync(serializedData, {
			...this._compressOptions,
			...options,
		});
	}

	async decompress<T>(data?: InputType, options?: BrotliOptions): Promise<T> {
		if (!data) {
			return undefined as unknown as T;
		}

		if (!this._enable) {
			return data as unknown as T;
		}

		const decompressedBuffer = await brotliDecompressAsync(data, {
			...this._decompressOptions,
			...options,
		});
		return this._deserialize(decompressedBuffer) as T;
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
