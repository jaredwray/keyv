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

test('serialize with brotli compression', async t => {
	const keyv = new KeyvBrotli();
	const {serialize} = keyv.opts;
	const json = await serialize({value: 'whatever'});
	console.log(keyv.opts);
	t.is(json, '{"value":":base64:GwkA+CVEShFHYpYE"}');
});

test('deserialize with brotli compression', async t => {
	const keyv = new KeyvBrotli();
	const {serialize, deserialize} = keyv.opts;
	const json = await serialize({value: 'whatever'});
	const djson = await deserialize(json);
	t.deepEqual(djson, {expires: undefined, value: 'whatever'});
});
