
import test from 'ava';
import {keyvCompresstionTests} from '@keyv/test-suite';
import KeyvGzip from '../src/index';

keyvCompresstionTests(test, new KeyvGzip());

test('object type compression/decompression', async t => {
	const keyv = new KeyvGzip();
	const testValue = JSON.stringify({my: 'super', puper: [456, 567], awesome: 'pako'});
	const compressed = await keyv.compress(testValue);
	const decompressed = await keyv.decompress(compressed);
	t.deepEqual(decompressed, testValue);
});

// Test options while compress
test('options while compress', async t => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await keyv.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});
// Test options at class level
test('options at class level', async t => {
	const keyv = new KeyvGzip({chunkSize: 32 * 1024});
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await new KeyvGzip().compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});

test('compression with compression options', async t => {
	const options = {};

	const keyv = new KeyvGzip(options);
	const keyvWithoutOptions = new KeyvGzip();
	const compressed = await keyv.compress('whatever');
	const compressedWithoutOptions = await keyvWithoutOptions.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});

test('decompression with decompression options', async t => {
	const options = {};

	const keyv = new KeyvGzip(options);
	const compressed = await keyv.compress('whatever');
	const decompressed = await keyv.decompress(compressed, options);
	// @ts-expect-error - TS doesn't know that decompressed is a string
	t.is(decompressed, 'whatever');
});
