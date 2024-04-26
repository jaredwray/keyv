import zlib from 'node:zlib';
import v8 from 'node:v8';
import test from 'ava';
import Keyv, {type KeyvStoreAdapter} from 'keyv';
import KeyvBrotli from '../src/index';

type MyType = {
	a?: string;
	b?: number[];
};

test('default options', async t => {
	const keyv = new Keyv({
		store: new Map() as unknown as KeyvStoreAdapter,
		compression: new KeyvBrotli(),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get<MyType>('testkey'), {a: 'testvalue'});
});

test('compression user defined options', async t => {
	const options = {
		compressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const keyv = new Keyv({
		store: new Map() as unknown as KeyvStoreAdapter,
		compression: new KeyvBrotli(options),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});

test('user defined options', async t => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
	};

	const keyv = new Keyv({
		store: new Map() as unknown as KeyvStoreAdapter,
		compression: new KeyvBrotli(options),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});

test('using number array with v8', async t => {
	const options = {
		decompressOptions: {
			chunkSize: 1024,
			parameters: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
			},
		},
		serialize: v8.serialize,
		deserialize: v8.deserialize,
	};

	const map = new Map() as unknown as KeyvStoreAdapter;

	const keyv = new Keyv({
		store: map,
		compression: new KeyvBrotli(options),
	});

	t.true(await keyv.set('testkey', {b: [1, 2, 3]}));
	t.deepEqual(await keyv.get('testkey'), {b: [1, 2, 3]});
});

