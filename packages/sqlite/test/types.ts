import test from 'ava';
import Keyv from 'keyv';
import KeyvSqlite from '../src/index';

type MyType = {
	a: string;
};

test('can specify sqlite store in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new KeyvSqlite('sqlite://test/testdb.sqlite'),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
