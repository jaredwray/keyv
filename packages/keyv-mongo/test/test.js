const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvMongo = require('this');

const mongoURL = 'mongodb://127.0.0.1:27017';

keyvOfficialTests(test, Keyv, mongoURL, 'mongodb://127.0.0.1:1234');

const store = () => new KeyvMongo(mongoURL);
keyvTestSuite(test, Keyv, store);

test('default options', t => {
	const store = new KeyvMongo();
	t.deepEqual(store.opts, {
		url: 'mongodb://127.0.0.1:27017',
		collection: 'keyv',
	});
});

test('Collection option merges into default options', t => {
	const store = new KeyvMongo({ collection: 'foo' });
	t.deepEqual(store.opts, {
		url: 'mongodb://127.0.0.1:27017',
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
