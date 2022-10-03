'use strict';
const compressBrotli = require('compress-brotli');

class KeyvBrotli {
	constructor(options) {
		this.opts = options;
		this.brotli = compressBrotli(this.opts);
	}

	compress(value) {
		return this.brotli.compress(value, this.opts);
	}

	decompress(data) {
		return this.brotli.decompress(data);
	}

	async serialize({value, expires}) {
		return this.brotli.serialize({value: await this.compress(value), expires});
	}

	async deserialize(data) {
		const {value, expires} = this.brotli.deserialize(data);
		return {value: await this.decompress(value), expires};
	}
}

module.exports = KeyvBrotli;
