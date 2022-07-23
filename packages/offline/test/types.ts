import test from 'ava';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import KeyvOffline from '../src/index.js';

type MyType = {
	a: string;
};

test('can specify etcd store in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new KeyvOffline(new KeyvRedis('redis://localhost')),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
