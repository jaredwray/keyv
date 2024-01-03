import Keyv, {type CompressionAdapter} from 'keyv';
import type {TestFn} from 'ava';

const keyvCompressionTests = (test: TestFn, compression: CompressionAdapter) => {
	let keyv;
	test.beforeEach(async () => {
		keyv = new Keyv({
			store: new Map(),
			compression,
		});
		await keyv.clear();
	});

	test('number array compression/decompression', async t => {
		const array = JSON.stringify([4, 5, 6, 7]);
		const compressed = await compression.compress(array);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.deepEqual(decompressed, [4, 5, 6, 7]);
	});

	test.serial('compression/decompression using default options', async t => {
		const compressed = await compression.compress('whatever');
		t.not(compressed, 'whatever');
		const decompressed = await compression.decompress(compressed);
		t.is(decompressed, 'whatever');
	});

	test.serial('compression/decompression with number', async t => {
		const number_ = JSON.stringify(5);
		const compressed = await compression.compress(number_);
		t.not(compressed, 5);
		const decompressed = JSON.parse(await compression.decompress(compressed));
		t.is(decompressed, 5);
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

export default keyvCompressionTests;
