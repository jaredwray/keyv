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

	async compress(value: any, options?: any) {
		return pako.deflate(value, options ? options : this.opts);
	}

	async decompress(value: any, options?: any) {
		return pako.inflate(value, options ? options : this.opts);
	}

	async serialize({value, expires}: any) {
		return JSONB.stringify({value: await this.compress(value, this.opts), expires});
	}

	async deserialize(data: any) {
		const {value, expires} = JSONB.parse(data);
		return {value: await this.decompress(value, this.opts), expires};
	}
}

export default KeyvGzip;
