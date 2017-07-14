import test from 'ava';
import keyvApiTests from 'keyv-api-tests';
import Keyv from 'keyv';
import KeyvMongo from '../';

const store = new KeyvMongo();
keyvApiTests(test, Keyv, store);

test('Redis URL can be passed in as string', t => {
	const store = new KeyvMongo('foo');
	t.is(store.opts.url, 'foo');
});
