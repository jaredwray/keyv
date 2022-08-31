const {gzip, ungzip} = require('node-gzip');
const JSONB = require('json-buffer');

class KeyvGzip {
	constructor(options) {
		this.opts = {
			...options,
		};

		this.opts.compress = gzip;
		this.opts.decompress = ungzip;
		this.opts.serialize = async ({value, expires}) => JSONB.stringify({value: await gzip(value, this.opts), expires});
		this.opts.deserialize = async data => {
			const {value, expires} = JSONB.parse(data);
			const value_ = await ungzip(value, this.opts);
			return {value: value_.toString(), expires};
		};
	}

	compress(value, options) {
		return this.opts.compress(value, options);
	}

	decompress(value, options) {
		return this.opts.decompress(value, options);
	}
}

module.exports = KeyvGzip;
