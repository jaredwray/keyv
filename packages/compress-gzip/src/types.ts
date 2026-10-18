import type { DeflateOptions, InflateOptions } from "pako";

export type Options = DeflateOptions &
	InflateOptions & {
		/**
		 * pako v2 inflate option. `"string"` decompresses to text.
		 * Still accepted: it maps to pako v3 `toText: true`.
		 */
		to?: "string";
		/**
		 * pako v3 equivalent of `to: "string"`.
		 * `decompress` still always returns a string, matching v2.
		 */
		toText?: boolean;
	};

export type Serialize = {
	value: string | Uint8Array | ArrayBuffer;
	expires?: number;
};
