import type {BrotliOptions, CompressCallback, InputType} from 'node:zlib';
import type {parse as JSONBparse, stringify as JSONBstringify} from 'json-buffer';

export type CompressResult = Promise<Parameters<CompressCallback>[1]>;
export type DecompressResult = Promise<ReturnType<typeof JSONBparse>>;

export type SerializeResult = ReturnType<typeof JSONBstringify>;
export type DeserializeResult = ReturnType<typeof JSONBparse>;

type BrotliSerialize<T> = (source: InputType) => T;
type BrotliDeserialize<T> = (source: CompressResult) => T;

export type Serialize = {
	value: InputType;
	expires?: number;
};

export interface Options {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
	enable?: boolean;
	serialize?: any;
	deserialize?: any;
	iltorb?: any;
}

export interface Brotli {
	serialize: BrotliSerialize<SerializeResult>;
	deserialize: BrotliDeserialize<DeserializeResult>;
	compress: (data: InputType, options?: BrotliOptions) => CompressResult;
	decompress: (data: InputType, options?: BrotliOptions) => DecompressResult;
}
