import type { KeyvStorageAdapter } from "keyv";

// biome-ignore lint/suspicious/noExplicitAny: type format
export type KeyvStoreFn = () => KeyvStorageAdapter | any;

export type TestFunction = (
	name: string,
	// biome-ignore lint/suspicious/noExplicitAny: minimal vitest context type
	fn: (context: { expect: (...args: any[]) => any }) => void | Promise<void>,
) => void;

export type StorageFn = () => KeyvStorageAdapter;

export type StorageTestOptions = {
	/** Value returned by get() for missing/expired keys. Default: undefined */
	missingValue?: undefined | null;
};
