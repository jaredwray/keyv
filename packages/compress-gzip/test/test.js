const test = require('ava');
const KeyvGzip = require('this');

test('gzip compression/decompression', async t => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed.toString(), 'whatever');
});

// Test serialize compression
test('serialize compression', async t => {
	const keyv = new KeyvGzip();
	const {serialize} = keyv.opts;
	const json = await serialize({value: 'whatever'});
	t.is(json, '{"value":":base64:H4sIAAAAAAAAAyvPSCxJLUstAgCzQxFOCAAAAA=="}');
});
// Test deserialize compression
test('deserialize compression', async t => {
	const keyv = new KeyvGzip();
	const {serialize, deserialize} = keyv.opts;
	const json = await serialize({value: 'whatever'});
	const djson = await deserialize(json);
	t.deepEqual(djson, {expires: undefined, value: 'whatever'});
});
// Test options while compress
test('options while compress', async t => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress('whatever', {chunkSize: 32 * 1024});
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await keyv.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});
// Test options while decompress
test('options while decompress', async t => {
	const keyv = new KeyvGzip();
	const compressed = await keyv.compress('whatever', {chunkSize: 32 * 1024});
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await keyv.compress('whatever');
	t.not(compressed, compressedWithoutOptions);
	const decompress = await keyv.decompress(compressed);
	const decompressWithoutOptions = await keyv.decompress(compressedWithoutOptions);
	t.not(decompress, decompressWithoutOptions);
	t.is(decompress.toString(), decompressWithoutOptions.toString());
});
// Test options at class level
test('options at class level', async t => {
	const keyv = new KeyvGzip({chunkSize: 32 * 1024});
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const compressedWithoutOptions = await new KeyvGzip().compress('whatever');
	t.not(compressed, compressedWithoutOptions);
});
