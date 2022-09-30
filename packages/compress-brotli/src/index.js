'use strict';
const compressBrotli = require('compress-brotli');

class KeyvBrotli {
	brotli;
	constructor(options) {
		this.opts = {
			...options,
		};

		this.brotli = compressBrotli(this.opts);
		this.opts.serialize = async ({value, expires}) => this.brotli.serialize({value: await this.brotli.compress(value), expires});

		this.opts.deserialize = async data => {
			const {value, expires} = this.brotli.deserialize(data);
			return {value: await this.brotli.decompress(value), expires};
		};
	}

	compress(value) {
		return this.brotli.compress(value, this.opts);
	}

	decompress(value) {
		return this.brotli.decompress(value, this.opts);
	}
}

module.exports = KeyvBrotli;
