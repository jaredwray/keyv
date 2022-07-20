import test from 'ava';
import Keyv from 'keyv';
import KeyvMysql from '../../redis/src/index.js';

type MyType = {
	a: string;
};

test('can specify redis store in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new KeyvMysql("mysql://root@localhost/keyv_test"),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
