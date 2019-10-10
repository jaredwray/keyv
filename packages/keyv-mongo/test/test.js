import 'dotenv/config';
import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvMongo from '..';

const { MONGO_HOST = '127.0.0.1' } = process.env;
const mongoURL = `mongodb://${MONGO_HOST}:27017`;

keyvOfficialTests(test, Keyv, mongoURL, 'mongodb://127.0.0.1:1234');

const store = () => new KeyvMongo(mongoURL);
keyvTestSuite(test, Keyv, store);

test('Collection option merges into default options', t => {
	const store = new KeyvMongo({ collection: 'foo' });

	store.on('error', (() => {}));

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
	const store = new KeyvMongo('mongodb://foo'); // Make sure we don't actually connect
	t.false(await store.delete());
});
