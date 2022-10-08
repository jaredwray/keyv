const pako = require('pako');
const JSONB = require('json-buffer');

class KeyvGzip {
	constructor(options) {
		this.opts = {
			to: 'string',
			...options,
		};
	}

	async compress(value, options) {
		return pako.deflate(value, options ? options : this.opts);
	}

	async decompress(value, options) {
		return pako.inflate(value, options ? options : this.opts);
	}

	async serialize({value, expires}) {
		return JSONB.stringify({value: await this.compress(value, this.opts), expires});
	}

	async deserialize(data) {
		const {value, expires} = JSONB.parse(data);
		return {value: await this.decompress(value, this.opts), expires};
	}
}

module.exports = KeyvGzip;
