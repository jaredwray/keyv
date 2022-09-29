const pako = require('pako');
const JSONB = require('json-buffer');

class KeyvGzip {
	constructor(options) {
		this.opts = {
			to: 'string',
			...options,
		};

		this.opts.compress = pako.deflate;
		this.opts.decompress = pako.inflate;
		this.opts.serialize = async ({value, expires}) => JSONB.stringify({value: await this.opts.compress(value, this.opts), expires});
		this.opts.deserialize = async data => {
			const {value, expires} = JSONB.parse(data);
			const value_ = await this.opts.decompress(value, this.opts);
			return {value: value_, expires};
		};
	}

	compress(value) {
		return this.opts.compress(value, this.opts);
	}

	decompress(value) {
		return this.opts.decompress(value, this.opts);
	}
}

module.exports = KeyvGzip;
