import pako from 'pako';
import JSONB from 'json-buffer';
import type {Options, Serialize} from './types';

class KeyvGzip {
	opts: Options;
	constructor(options?: Options) {
		this.opts = {
			to: 'string',
			...options,
		};
	}

	async compress(value: pako.Data | string, options?: Options) {
		return pako.deflate(value, options || this.opts);
	}

	async decompress(value: pako.Data, options?: Options) {
		if (options) {
			options.to = 'string';
		}

		return pako.inflate(value, options || this.opts);
	}

	async serialize({value, expires}: Serialize) {
		return JSONB.stringify({value: await this.compress(value), expires});
	}

	async deserialize(data: string) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const {value, expires}: Serialize = JSONB.parse(data);
		return {value: await this.decompress(value as pako.Data), expires};
	}
}

export = KeyvGzip;
