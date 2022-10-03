const pako = require('pako');
const JSONB = require('json-buffer');

class KeyvGzip {
	constructor(options) {
		this.opts = {
			to: 'string',
			...options,
		};
	}

	compress(value) {
		return pako.deflate(value, this.opts);
	}

	decompress(value) {
		return pako.inflate(value, this.opts);
	}

	async serialize({value, expires}) {
		return JSONB.stringify({value: await pako.deflate(value, this.opts), expires});
	}

	async deserialize(data) {
		const {value, expires} = JSONB.parse(data);
		return {value: await this.decompress(value), expires};
	}
}

module.exports = KeyvGzip;
