import test from 'ava';
import Keyv from 'keyv';
import KeyvMongo from '../src/index';

type MyType = {
	a: string;
};

test('can specify mongo store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvMongo('mongodb://127.0.0.1:27017'),
	});

	t.true(await keyv.set('testkey', {a: 'testvalue'}));
	t.deepEqual(await keyv.get<MyType>('testkey'), {a: 'testvalue'});
});
