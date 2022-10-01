'use strict';
const compressBrotli = require('compress-brotli');

class KeyvBrotli {
	constructor(options) {
		this.opts = {
			...options,
		};

		const {compress, decompress, serialize, deserialize} = compressBrotli(this.opts);

		this.opts.compress = compress;
		this.opts.serialize = async ({value, expires}) => serialize({value: await compress(value), expires});

		this.opts.decompress = decompress;
		this.opts.deserialize = async data => {
			const {value, expires} = deserialize(data);
			return {value: await decompress(value), expires};
		};
	}

	compress(value, options) {
		return this.opts.compress(value, options);
	}

	decompress(value, options) {
		return this.opts.decompress(value, options);
	}
}

module.exports = KeyvBrotli;
