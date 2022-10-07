import test from 'ava';
import Keyv from 'keyv';
import KeyvGzip from '../src/index.js';

type MyType = {
	a: string;
};

test('can specify compression using default options in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new Map(),
		compression: new KeyvGzip(),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});

test('can specify compression using user defined options in typescript', async t => {
	const options = {};

	const keyv = new Keyv<MyType>({
		store: new Map(),
		compression: new KeyvGzip(options),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
