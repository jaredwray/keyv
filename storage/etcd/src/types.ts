import type { StoredData } from "keyv";

/** Resolves to the stored value, or `undefined` if the key does not exist. */
export type GetOutput<Value> = Promise<Value | undefined>;

/** Resolves to an array of stored data corresponding to each requested key. */
export type GetManyOutput<Value> = Promise<
	Array<StoredData<Value | undefined> | undefined>
>;

/** Resolves when the value has been stored. */
export type SetOutput = Promise<void>;

/** Resolves to `true` if the key was deleted, `false` otherwise. */
export type DeleteOutput = Promise<boolean>;

/** Resolves to `true` if all keys were successfully deleted, `false` otherwise. */
export type DeleteManyOutput = Promise<boolean>;

/** Resolves when the clear operation is complete. */
export type ClearOutput = Promise<void>;

/** Resolves to `true` if the key exists, `false` otherwise. */
export type HasOutput = Promise<boolean>;
