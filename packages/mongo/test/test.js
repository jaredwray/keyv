const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const Keyv = require('keyv');
const KeyvMongo = require('this');

const mongoURL = 'mongodb://127.0.0.1:27017';

const store = () => new KeyvMongo(mongoURL);
keyvTestSuite(test, Keyv, store);

test('default options', t => {
	const store = new KeyvMongo();
	t.deepEqual(store.opts, {
		url: mongoURL,
		collection: 'keyv',
	});
});

test('default options with url.uri', t => {
	const store = new KeyvMongo({ uri: mongoURL });
	t.is(store.opts.uri, mongoURL);
	t.is(store.opts.url, mongoURL);
});

test('Collection option merges into default options', t => {
	const store = new KeyvMongo({ collection: 'foo' });
	t.deepEqual(store.opts, {
		url: mongoURL,
		collection: 'foo',
	});
});

test('Collection option merges into default options if URL is passed', t => {
	const store = new KeyvMongo(mongoURL, { collection: 'foo' });
	t.deepEqual(store.opts, {
		url: mongoURL,
		collection: 'foo',
	});
});

test('.delete() with no args doesn\'t empty the collection', async t => {
	const store = new KeyvMongo('foo'); // Make sure we don't actually connect
	t.false(await store.delete());
});
