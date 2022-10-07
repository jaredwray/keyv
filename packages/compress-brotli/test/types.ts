import zlib from 'node:zlib';
import v8 from 'node:v8';
import test from 'ava';
import Keyv from 'keyv';
import json from 'json-buffer';
import KeyvBrotli from '../src/index.js';

type MyType = {
	a?: string;
	b?: number[];
};

test('default options', async t => {
	const keyv = new Keyv<MyType>({
		store: new Map(),
		compression: new KeyvBrotli(),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
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

	const keyv = new Keyv<MyType>({
		store: new Map(),
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

	const keyv = new Keyv<MyType>({
		store: new Map(),
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

	const map = new Map();

	const keyv = new Keyv<MyType>({
		store: map,
		compression: new KeyvBrotli(options),
	});

	t.true(await keyv.set('testkey', {b: [1, 2, 3]}));
	console.log(map.keys());
	t.deepEqual(await keyv.get('testkey'), {b: [1, 2, 3]});
});

test('decompression using number array with json-buffer', async t => {
	const options = {
		serialize: json.stringify,
		deserialize: json.parse,
	};

	const map = new Map();

	const keyv = new Keyv<MyType>({
		store: map,
		compression: new KeyvBrotli(options),
	});
	t.true(await keyv.set('testkey', {b: [1, 2, 3]}));
	console.log(map.keys());
	t.deepEqual(await keyv.get('testkey'), {b: [1, 2, 3]});
});
