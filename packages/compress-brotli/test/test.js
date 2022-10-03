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
	const options = {
		enable: false,
	};
	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress('whatever');
	t.is(compressed, 'whatever');
	const decompressed = await keyv.decompress(compressed);
	t.is(decompressed, 'whatever');
});

// Test serialize compression
test('serialize compression', async t => {
	const keyv = new KeyvBrotli();
	const json = await keyv.serialize({value: 'whatever'});
	t.not(JSON.parse(json).value, 'whatever');
});

// Test deserialize compression
test('deserialize compression', async t => {
	const keyv = new KeyvBrotli();
	const json = await keyv.serialize({value: 'whatever'});
	const djson = await keyv.deserialize(json);
	t.deepEqual(djson, {expires: undefined, value: 'whatever'});
});
