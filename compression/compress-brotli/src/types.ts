// biome-ignore-all lint/suspicious/noExplicitAny: required for this type
import type { BrotliOptions, InputType } from "node:zlib";

export type CompressResult = Promise<Buffer>;

export type SerializeResult = string;

export type Serialize = {
	value?: InputType;
	expires?: number;
};

export type Options = {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
	enable?: boolean;
	serialize?: (value: any) => any;
	deserialize?: (data: any) => any;
};
