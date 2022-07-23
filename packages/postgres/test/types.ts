import test from 'ava';
import Keyv from 'keyv';
import KeyvPostgres from '../src/index.js';

type MyType = {
	a: string;
};

test('can specify postgres store in typescript', async t => {
	const keyv = new Keyv<MyType>({
		store: new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test'}),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get('testkey'), {a: 'testvalue'});
});
