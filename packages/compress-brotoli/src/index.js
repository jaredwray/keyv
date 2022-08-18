'use strict';

const EventEmitter = require('events');
const compressBrotli = require('compress-brotli');

class KeyvBrotli extends EventEmitter {
	constructor(options) {
		super();
		this.opts = {
			...options,
		};

		const {compress, decompress, serialize, deserialize} = compressBrotli(this.opts.options);

		if (typeof this.opts.compress !== 'function') {
			this.opts.compress = compress;
			this.opts.serialize = async ({value, expires}) => serialize({value: await compress(value), expires});
		}

		if (typeof this.opts.decompress !== 'function') {
			this.opts.decompress = decompress;
			this.opts.deserialize = async data => {
				const {value, expires} = deserialize(data);
				return {value: await decompress(value), expires};
			};
		}
	}

	compress(value, options) {
		return this.opts.compress(value, options);
	}

	decompress(value, options) {
		return this.opts.decompress(value, options);
	}

	serialize(value) {
		return this.opts.serialize(value);
	}

	deserialize(value) {
		return this.opts.deserialize(value);
	}
}

module.exports = KeyvBrotli;
