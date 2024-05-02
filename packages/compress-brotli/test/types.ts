import zlib from 'node:zlib';
import v8 from 'node:v8';
import * as test from 'vitest';
import Keyv, {type KeyvStoreAdapter} from 'keyv';
import KeyvBrotli from '../src/index';

type MyType = {
	a?: string;
	b?: number[];
};

test.it('default options', async t => {
	const keyv = new Keyv({
		store: new Map() as unknown as KeyvStoreAdapter,
		compression: new KeyvBrotli(),
	});

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBe(true);
	t.expect(await keyv.get<MyType>('testkey')).toEqual({a: 'testvalue'});
});

test.it('compression user defined options', async t => {
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

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBe(true);
	t.expect(await keyv.get<MyType>('testkey')).toEqual({a: 'testvalue'});
});

test.it('user defined options', async t => {
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

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBe(true);
	t.expect(await keyv.get<MyType>('testkey')).toEqual({a: 'testvalue'});
});

test.it('using number array with v8', async t => {
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

	t.expect(await keyv.set('testkey', {b: [1, 2, 3]})).toBe(true);
	t.expect(await keyv.get<MyType>('testkey')).toEqual({b: [1, 2, 3]});
});

