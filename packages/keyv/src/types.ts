export type KeyvCompression = {
	compress: (data: string) => string;
	decompress: (data: string) => string;
};

export type KeyvSerialization = {
	stringify: (object: unknown) => string;
	parse: <T>(data: string) => T;
};

export type KeyvEncryption = {
	encrypt: (data: string) => string;
	decrypt: (data: string) => string;
};
