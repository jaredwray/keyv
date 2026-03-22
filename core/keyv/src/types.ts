export type KeyvCompression = {
	compress: (data: string) => string;
	decompress: (data: string) => string;
};

export type KeyvSerialization = {
	stringify: (object: unknown) => string | Promise<string>;
	parse: <T>(data: string) => T | Promise<T>;
};

export type KeyvEncryption = {
	encrypt: (data: string) => string;
	decrypt: (data: string) => string;
};
