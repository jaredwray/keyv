import {constants as zlibConstants} from 'node:zlib';
import v8 from 'node:v8';
import test from 'ava';
import {keyvCompresstionTests} from '@keyv/test-suite';
import KeyvBrotli from '../src/index';
import type {DeserializeResult} from '../src/types';

// eslint-disable-next-line @typescript-eslint/naming-convention
const {BROTLI_PARAM_MODE, BROTLI_PARAM_QUALITY} = zlibConstants;

// @ts-expect-error - KeyvBrotli type
keyvCompresstionTests(test, new KeyvBrotli());

test('object type compression/decompression', async t => {
	const keyv = new KeyvBrotli();
	const object = {
		a: 1,
		b: 'test',
		c: true,
	};
	const compressed = await keyv.compress(object);
	const decompressed = await keyv.decompress(compressed);
	t.deepEqual(decompressed, object);
});

test('disable brotli compression', async t => {
	const options = {
		enable: false,
	};
	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress('whatever');
	// @ts-expect-error Testing non-compressed value
	t.is(compressed, 'whatever');
	const decompressed: DeserializeResult = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

test('compression with compression options', async t => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
				[BROTLI_PARAM_QUALITY]: 7,
			},
		},
	};

	const keyv = new KeyvBrotli(options);
	const keyvWithoutOptions = new KeyvBrotli();
	const compressed = await keyv.compress('whatever');
	const compressedWithoutOptions = await keyvWithoutOptions.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});

test('decompression with decompression options', async t => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress('whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

test('compression/decompression with compression/decompression options', async t => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[BROTLI_PARAM_MODE]: 2,
			},
		},
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress('whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

test('decompression using number array with v8', async t => {
	const options = {
		serialize: v8.serialize,
		deserialize: v8.deserialize,
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress({help: [1, 2, 4]});
	const decompressed = await keyv.decompress(compressed);
	t.deepEqual(decompressed, {help: [1, 2, 4]});
});

