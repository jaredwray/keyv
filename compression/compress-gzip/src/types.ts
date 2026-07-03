import type { DeflateOptions, InflateOptions } from "pako";

type PakoDeflateOptions = DeflateOptions;

type PakoInflateOptions = InflateOptions & { toText?: boolean };

export type Options = PakoDeflateOptions & PakoInflateOptions;
