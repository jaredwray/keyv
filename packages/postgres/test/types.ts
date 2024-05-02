import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvPostgres from '../src/index';

type MyType = {
	a: string;
};

test.it('can specify postgres store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test'}),
	});
	await keyv.clear();
	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toStrictEqual({a: 'testvalue'});
});
