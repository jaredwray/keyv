import pako from 'pako';
import JSONB from 'json-buffer';

class KeyvGzip {
	opts: any;
	constructor(options?: any) {
		this.opts = {
			to: 'string',
			...options,
		};
	}

	async compress(value: pako.Data | string, options?: any) {
		return pako.deflate(value, options || this.opts);
	}

	async decompress(value: pako.Data, options?: any) {
		if (options) {
			options.to = 'string';
		}

		return pako.inflate(value, options || this.opts);
	}

	async serialize({value, expires}: any) {
		return JSONB.stringify({value: await this.compress(value), expires});
	}

	async deserialize(data: any) {
		const {value, expires} = JSONB.parse(data);
		return {value: await this.decompress(value), expires};
	}
}

export = KeyvGzip;
