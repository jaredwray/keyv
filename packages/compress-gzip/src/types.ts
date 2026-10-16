import type { DeflateOptions, InflateOptions } from "pako";

export type Options = DeflateOptions &
	InflateOptions & {
		toText?: boolean;
	};

export type Serialize = {
	value: string | Uint8Array | ArrayBuffer;
	expires?: number;
};
