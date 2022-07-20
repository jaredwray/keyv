import test from 'ava';
import Keyv from 'keyv';
import KeyvMemcache from '../src/index.js';

type MyType = {
	a: string;
};

test('can specify etcd store in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new KeyvMemcache('localhost:11211'),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
