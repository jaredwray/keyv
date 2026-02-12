// biome-ignore-all lint/suspicious/noExplicitAny: required for this type
import type { BrotliOptions, CompressCallback, InputType } from "node:zlib";

export type CompressResult = Promise<Parameters<CompressCallback>[1]>;
export type DecompressResult = Promise<any>;

export type SerializeResult = string;
export type DeserializeResult = any;

type BrotliSerialize<T> = (source: InputType) => T;
type BrotliDeserialize<T> = (source: CompressResult) => T;

export type Serialize = {
	value?: InputType;
	expires?: number;
};

export type Options = {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
	enable?: boolean;
	serialize?: any;
	deserialize?: any;
	iltorb?: any;
};

export type Brotli = {
	serialize: BrotliSerialize<SerializeResult>;
	deserialize: BrotliDeserialize<DeserializeResult>;
	compress: (data: InputType, options?: BrotliOptions) => CompressResult;
	decompress: (data: InputType, options?: BrotliOptions) => DecompressResult;
};
