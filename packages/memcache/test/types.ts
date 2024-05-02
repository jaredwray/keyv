import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvMemcache from '../src/index';

type MyType = {
	a: string;
};

test.it('can specify memcached store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvMemcache('localhost:11211'),
	});

	t.expect(await keyv.set('typeskey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('typeskey')).toEqual({a: 'testvalue'});
});
