import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvMysql from '../src/index';

type MyType = {
	a: string;
};

test.it('can specify mysql store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvMysql('mysql://root@localhost/keyv_test'),
	});

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toStrictEqual({a: 'testvalue'});
});
