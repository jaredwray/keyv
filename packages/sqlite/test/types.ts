import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvSqlite from '../src/index';

type MyType = {
	a: string;
};

test.beforeEach(async () => {
	const keyv = new KeyvSqlite('sqlite://test/testdb.sqlite');
	await keyv.clear();
});

test.it('can specify sqlite store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvSqlite('sqlite://test/testdb.sqlite'),
	});

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toEqual({a: 'testvalue'});
});
