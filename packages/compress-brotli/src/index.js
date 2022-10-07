'use strict';
const compressBrotli = require('compress-brotli');

class KeyvBrotli {
	constructor(options) {
		this.brotli = compressBrotli(options);
	}

	async compress(value, options) {
		return this.brotli.compress(value, options);
	}

	async decompress(data, options) {
		return this.brotli.decompress(data, options);
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
