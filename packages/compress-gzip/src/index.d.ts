declare class KeyvGzip {
	ttlSupport: any;
	opts: any;
	constructor(options?);
	async compress(value: any);
	async decompress(value: any);
	async serialize(value: any);
	async deserialize(value: any);
}

export = KeyvGzip;
