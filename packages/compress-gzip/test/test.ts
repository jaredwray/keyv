/* eslint-disable @typescript-eslint/no-unsafe-call */
const test = require('ava');
const {keyvCompresstionTests} = require('@keyv/test-suite');
const KeyvGzip = require('../dist/index.js').default;

keyvCompresstionTests(test, new KeyvGzip());

test('number array compression/decompression with Unit8Array', async (t: any) => {
	const keyv = new KeyvGzip();
	const array = new Uint8Array([4, 5, 6, 7]);
	const compressed = await keyv.compress(array);
	const decompressed = await keyv.decompress(compressed, {});
	t.deepEqual(decompressed, array);
});

test('object type compression/decompression', async (t: any) => {
	const keyv = new KeyvGzip();
	const object = new Uint8Array([1, 2, 3]);
	const compressed = await keyv.compress(object);
	const decompressed = await keyv.decompress(compressed, {});
	t.deepEqual(decompressed, object);
});

// Test options while compress
test('options while compress', async (t: any) => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress('whatever', {chunkSize: 32 * 1024});
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await keyv.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});
// Test options at class level
test('options at class level', async (t: any) => {
	const keyv = new KeyvGzip({chunkSize: 32 * 1024});
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await new KeyvGzip().compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});

test('compression with compression options', async (t: any) => {
	const options = {};

	const keyv = new KeyvGzip(options);
	const keyvWithoutOptions = new KeyvGzip();
	const compressed = await keyv.compress('whatever');
	const compressedWithoutOptions = await keyvWithoutOptions.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});

test('decompression with decompression options', async (t: any) => {
	const options = {};

	const keyv = new KeyvGzip(options);
	const compressed = await keyv.compress('whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

test('compression/decompression with compression/decompression options', async (t: any) => {
	const options = {
		chunkSize: 1024,
	};

	const keyv = new KeyvGzip();
	const compressed = await keyv.compress('whatever', options);
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});
