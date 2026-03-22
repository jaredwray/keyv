import type { BrotliOptions } from "node:zlib";

export type Options = {
	compressOptions?: BrotliOptions;
	decompressOptions?: BrotliOptions;
	enable?: boolean;
};
