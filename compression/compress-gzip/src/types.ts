import type { DeflateFunctionOptions, InflateOptions } from "pako";

type PakoDeflateOptions = DeflateFunctionOptions;

type PakoInflateOptions = InflateOptions & { to?: "string" };

export type Options = PakoDeflateOptions & PakoInflateOptions;
