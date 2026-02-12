import type { StoredData } from "keyv";

export type GetOutput<Value> = Promise<Value | undefined>;

export type GetManyOutput<Value> = Promise<
	Array<StoredData<Value | undefined> | undefined>
>;

export type SetOutput = Promise<void>;

export type DeleteOutput = Promise<boolean>;

export type DeleteManyOutput = Promise<boolean>;

export type ClearOutput = Promise<void>;

export type HasOutput = Promise<boolean>;
