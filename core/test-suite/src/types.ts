import type { KeyvStorageAdapter } from "keyv";

// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvStoreFn = () => KeyvStorageAdapter | any;
