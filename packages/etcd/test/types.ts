import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvEtcd from '../src/index';

type MyType = {
	a: string;
};

test.beforeEach(async () => {
	const keyv = new Keyv({
		store: new KeyvEtcd({uri: 'etcd://127.0.0.1:2379'}),
	});
	await keyv.clear();
});

test.it('can specify etcd store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvEtcd({uri: 'etcd://127.0.0.1:2379'}),
	});

	t.expect(await keyv.set('typeskey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('typeskey')).toEqual({a: 'testvalue'});
});
