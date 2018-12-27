import 'dotenv/config'; // eslint-disable-line import/no-unassigned-import
import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvMongo from 'this';

const mongoURL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';

keyvOfficialTests(test, Keyv, mongoURL, 'mongodb://127.0.0.1:1234');

const store = () => new KeyvMongo(mongoURL);
keyvTestSuite(test, Keyv, store);

test('Collection option merges into default options', t => {
	const store = new KeyvMongo({ collection: 'foo' });
	t.deepEqual(store.opts, {
		url: 'mongodb://127.0.0.1:27017',
		collection: 'foo'
	});
});

test('Collection option merges into default options if URL is passed', t => {
	const store = new KeyvMongo(mongoURL, { collection: 'foo' });
	t.deepEqual(store.opts, {
		url: mongoURL,
		collection: 'foo'
	});
});

test('.delete() with no args doesn\'t empty the collection', async t => {
	const store = new KeyvMongo('foo'); // Make sure we don't actually connect
	t.false(await store.delete());
});
