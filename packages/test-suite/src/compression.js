const Keyv = require('keyv');

const keyvCompressionTests = (test, compression) => {
	let keyv;
	test.beforeEach(async () => {
		keyv = new Keyv({
			store: new Map(),
			compression,
		});
		await keyv.clear();
	});

	test.serial('compression/decompression using default options', async t => {
		const compressed = await compression.compress('whatever');
		t.not(compressed, 'whatever');
		const decompressed = await compression.decompress(compressed);
		t.is(decompressed, 'whatever');
	});

	// Test serialize compression
	test('serialize compression', async t => {
		const json = await compression.serialize({value: 'whatever'});
		t.not(JSON.parse(json).value, 'whatever');
	});

	// Test deserialize compression
	test('deserialize compression', async t => {
		const json = await compression.serialize({value: 'whatever'});
		const djson = await compression.deserialize(json);
		t.deepEqual(djson, {expires: undefined, value: 'whatever'});
	});

	test('compress/decompress with main keyv', async t => {
		const keyv = new Keyv({store: new Map(), compression});
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
	});
};

module.exports = keyvCompressionTests;
