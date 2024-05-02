import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvRedis from '../src';

const redisHost = 'localhost';
const redisUri = `redis://${redisHost}`;

type MyType = {
	a: string;
};

test.it('can specify redis store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvRedis(redisUri),
	});

	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toStrictEqual({a: 'testvalue'});
	await keyv.clear();
	t.expect(true).toBeTruthy();
});
