export type Serialize = {
	value: string;
	expires?: number;
};

export type Deserialize = {
	value: Uint8Array;
	expires?: number;
};
