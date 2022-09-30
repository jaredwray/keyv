const pako = require('pako');
const JSONB = require('json-buffer');

class KeyvGzip {
	constructor(options) {
		this.opts = {
			to: 'string',
			...options,
		};
		this.opts.serialize = async ({value, expires}) => JSONB.stringify({value: await pako.deflate(value, this.opts), expires});
		this.opts.deserialize = async data => {
			const {value, expires} = JSONB.parse(data);
			const value_ = await pako.inflate(value, this.opts);
			return {value: value_, expires};
		};
	}

	compress(value) {
		return pako.deflate(value, this.opts);
	}

	decompress(value) {
		return pako.inflate(value, this.opts);
	}
}

module.exports = KeyvGzip;
