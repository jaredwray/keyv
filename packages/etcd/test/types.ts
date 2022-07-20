import test from 'ava';
import Keyv from 'keyv';
import KeyvEtcd from '../src/index.js';

type MyType = {
	a: string;
};

test('can specify etcd store in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new KeyvEtcd({uri: 'etcd://127.0.0.1:2379', busyTimeout: 3000}),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
