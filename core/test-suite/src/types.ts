import type { KeyvStoreAdapter } from "keyv";

// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvStoreFn = () => KeyvStoreAdapter | any;
