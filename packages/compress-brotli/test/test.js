const {
	constants: {
		BROTLI_PARAM_MODE,
		BROTLI_PARAM_QUALITY,
	},
} = require('zlib');
const v8 = require('v8');
const test = require('ava');
const KeyvBrotli = require('this');
const json = require('json-buffer');
const {keyvCompresstionTests} = require('@keyv/test-suite');

keyvCompresstionTests(test, new KeyvBrotli());

test('number array compression/decompression', async t => {
	const keyv = new KeyvBrotli();
	const array = [4, 5, 6, 7];
	const compressed = await keyv.compress(array);
	const decompressed = await keyv.decompress(compressed, {});
	t.deepEqual(decompressed, array);
});

test('object type compression/decompression', async t => {
	const keyv = new KeyvBrotli();
	const object = {
		a: 1,
		b: 'test',
		c: true,
	};
	const compressed = await keyv.compress(object);
	const decompressed = await keyv.decompress(compressed, {});
	t.deepEqual(decompressed, object);
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

test('decompression using number array with json-buffer', async t => {
	const options = {
		serialize: json.stringify,
		deserialize: json.parse,
	};

	const keyv = new KeyvBrotli(options);
	const compressed = await keyv.compress({help: [1, 2, 4]});
	const decompressed = await keyv.decompress(compressed);
	t.deepEqual(decompressed, {help: [1, 2, 4]});
});
