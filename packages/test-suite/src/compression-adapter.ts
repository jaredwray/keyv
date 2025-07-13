import {Buffer} from 'node:buffer';
import {compress, uncompress} from 'lz4-napi';
import {defaultDeserialize, defaultSerialize} from '@keyv/serialize';

export type Serialize = {
	value: string;
	expires?: number;
};

export type Deserialize = {
	value: Uint8Array;
	expires?: number;
};

export class CompressionAdapter {
	constructor(private readonly dictionary?: string) {}

	async compress(data: string): Promise<Uint8Array> {
		return compress(Buffer.from(data), this.getDictionary());
	}

	async decompress(data: Uint8Array): Promise<string> {
		const value = await uncompress(Buffer.from(data), this.getDictionary());

		return value.toString('utf8');
	}

	async serialize({value, expires}: Serialize): Promise<string> {
		const compressedUint8Array = await this.compress(value);

		return defaultSerialize({value: compressedUint8Array, expires});
	}

	async deserialize(data: string): Promise<Serialize> {
		const {value, expires}: Deserialize = defaultDeserialize(data);
		const uncompressedUint8Array = await this.decompress(value);

		return {value: uncompressedUint8Array, expires};
	}

	private getDictionary() {
		/* c8 ignore next 3 */
		if (this.dictionary) {
			return Buffer.from(this.dictionary);
		}

		return undefined;
	}
}
