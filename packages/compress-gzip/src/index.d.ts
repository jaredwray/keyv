declare class KeyvGzip {
	ttlSupport: any;
	opts: any;
	constructor(options?);
	compress(value: any);
	decompress(value: any);
	serialize(value: any);
	deserialize(value: any);
}

export = KeyvGzip;
