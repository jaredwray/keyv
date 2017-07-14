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

test('Collection option merges into default options', t => {
	const store = new KeyvMongo({ collection: 'foo' });
	t.deepEqual(store.opts, {
		url: 'mongodb://127.0.0.1:27017',
		collection: 'foo'
	});
});

test('.delete() with no args doesn\'t empty the collection', async t => {
	const store = new KeyvMongo('foo'); // Make sure we don't actually connect
	t.false(await store.delete());
});
