const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const Keyv = require('keyv');
const KeyvMongo = require('this');
const { keyvOfficialTests } = require('@keyv/test-suite');

const options = { useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 5000 };

const mongoURL = 'mongodb://127.0.0.1:27017';

keyvOfficialTests(test, Keyv, mongoURL, 'mongodb://foo', options);

const store = () => new KeyvMongo(mongoURL, options);
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

test('useGridFS option merges into default options', t => {
	const store = new KeyvMongo({ useGridFS: true, collection: 'foo' });
	t.deepEqual(store.opts, {
		url: mongoURL,
		useGridFS: true,
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
	const store = new KeyvMongo('mongodb://foo'); // Make sure we don't actually connect
	t.false(await store.delete());
});

test('.delete() with key as number', async t => {
	const store = new KeyvMongo(mongoURL, { collection: 'foo' });
	t.false(await store.delete(123));
});

test.serial('Stores value in GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.set('key1', 'keyv1', 0);
	const get = await store.get('key1');
	t.is(result.filename, 'key1');
	t.is(get, 'keyv1');
});

test.serial('Gets value from GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.get('key1');
	t.is(result, 'keyv1');
});

test.serial('Deletes value from GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.delete('key1');
	t.is(result, true);
});

test.serial('Deletes non existent value from GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.delete('no-existent-value');
	t.is(result, false);
});

test.serial('Stores value with TTL in GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.set('key1', 'keyv1', 0);
	t.is(result.filename, 'key1');
});

test.serial('Clears expired value from GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const cleared = await store.clearExpired();
	t.is(cleared, true);
});

test.serial('Clears unused files from GridFS', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const cleared = await store.clearUnusedFor(5);
	t.is(cleared, true);
});

test.serial('Clears expired value only when GridFS options is true', async t => {
	const store = new KeyvMongo(Object.assign(options));
	const cleared = await store.clearExpired();
	t.is(cleared, false);
});

test.serial('Clears unused files only when GridFS options is true', async t => {
	const store = new KeyvMongo(Object.assign(options));
	const cleared = await store.clearUnusedFor(5);
	t.is(cleared, false);
});

test.serial('Gets non-existent file and return should be undefined', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.get('non-existent-file');
	t.is(typeof result, 'undefined');
});

test.serial('Non-string keys are not permitted in delete', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.delete({
		ok: true,
	});
	t.is(result, false);
});

test.serial('Clears entire cache store', async t => {
	const store = new KeyvMongo(Object.assign({
		useGridFS: true,
	}, options));
	const result = await store.clear();
	t.is(typeof result, 'undefined');
});
