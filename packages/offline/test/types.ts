import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import KeyvOffline from '../src/index';

type MyType = {
	a: string;
};

test.it('can specify etcd store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvOffline(new KeyvRedis('redis://localhost')),
	});

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toStrictEqual({a: 'testvalue'});
});
