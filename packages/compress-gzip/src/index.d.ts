import type pako from 'pako';

declare class KeyvGzip {
	opts: any;
	constructor(options?: pako.DeflateFunctionOptions | pako.InflateFunctionOptions);
	compress(value: pako.Data | string, options?: pako.DeflateFunctionOptions): Promise<Uint8Array>;
	decompress(value: pako.Data, options?: pako.InflateFunctionOptions & {to: 'string'}): Promise<string>;
	decompress(value: pako.Data, options?: pako.InflateFunctionOptions): Promise<Uint8Array>;
	serialize(value: any): Promise<any>;
	deserialize(value: any): Promise<any>;
}

export = KeyvGzip;
