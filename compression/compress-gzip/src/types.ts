import type { Data, DeflateFunctionOptions, InflateOptions } from "pako";

type PakoDeflateOptions = DeflateFunctionOptions;

type PakoInflateOptions = InflateOptions & { to?: "string" };

export type Options = PakoDeflateOptions & PakoInflateOptions;

export type Serialize = {
	value: string | Data;
	expires?: number;
};
