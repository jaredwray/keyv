const {compress, uncompress} = require('snappy');
const test = require('ava');
const KeyvBrotli = require('this');

test('enable brotli compression', async t => {
	const keyv = new KeyvBrotli();
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

test('disable brotli compression', async t => {
	const compress = {
		options: {
			enable: false,
		},
	};
	const keyv = new KeyvBrotli(compress);
	const compressed = await keyv.compress('whatever');
	t.is(compressed, 'whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

test('serialize with brotli compression', async t => {
	const keyv = new KeyvBrotli();
	const json = await keyv.serialize({value: 'whatever'});
	t.is(json, '{"value":":base64:GwkA+CVEShFHYpYE"}');
});

test('deserialize with brotli compression', async t => {
	const keyv = new KeyvBrotli();
	const json = await keyv.serialize({value: 'whatever'});
	const djson = await keyv.deserialize(json);
	t.deepEqual(djson, {expires: undefined, value: 'whatever'});
});

test('compression/decompression with other package', async t => {
	const snappy = {
		compress,
		decompress: uncompress,
	};
	const keyv = new KeyvBrotli(snappy);
	const compressed = await keyv.compress('whatever');
	t.not(compressed, 'whatever');
	const decompressed = await keyv.decompress(compressed, {asBuffer: false});
	t.is(decompressed, 'whatever');
});
