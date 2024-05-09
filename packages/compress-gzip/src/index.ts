import pako from 'pako';
import {defaultSerialize, defaultDeserialize} from '@keyv/serialize';
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
		return defaultSerialize({value: await this.compress(value), expires});
	}

	async deserialize(data: string) {
		const {value, expires}: Serialize = defaultDeserialize(data);
		return {value: await this.decompress(value as pako.Data), expires};
	}
}

export default KeyvGzip;
