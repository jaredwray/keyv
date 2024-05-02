import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvMongo from '../src/index';

type MyType = {
	a: string;
};

test.beforeEach(async () => {
	const keyv = new KeyvMongo('mongodb://127.0.0.1:27017');
	await keyv.clear();
});

test.it('can specify mongo store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvMongo('mongodb://127.0.0.1:27017'),
	});

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toEqual({a: 'testvalue'});
});
