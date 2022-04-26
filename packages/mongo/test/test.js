const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const {keyvOfficialTests, keyvIteratorTests} = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvMongo = require('this');

const options = {useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 5000};

const mongoURL = 'mongodb://127.0.0.1:27017';

keyvOfficialTests(test, Keyv, mongoURL, 'mongodb://foo', options);

const store = () => new KeyvMongo(mongoURL, options);
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.after.always(async () => {
	let keyv = new KeyvMongo({...options});
	await keyv.clear();
	keyv = new KeyvMongo({collection: 'foo', useGridFS: true, ...options});
	await keyv.clear();
});

test.beforeEach(async () => {
	const keyv = new KeyvMongo({...options});
	await keyv.clear();
});

test('default options', t => {
	const store = new KeyvMongo();
	t.deepEqual(store.opts, {
		url: mongoURL,
		collection: 'keyv',
	});
});

test('default options with url.uri', t => {
	const store = new KeyvMongo({uri: mongoURL});
	t.is(store.opts.uri, mongoURL);
	t.is(store.opts.url, mongoURL);
});

test('Collection option merges into default options', t => {
	const store = new KeyvMongo({collection: 'foo'});
	t.deepEqual(store.opts, {
		url: mongoURL,
		collection: 'foo',
	});
});

test('useGridFS .has(key) where key is the key we are looking for', async t => {
	const keyv = new KeyvMongo({useGridFS: true, collection: 'foo'});
	await keyv.set('foo', 'bar');
	t.is(await keyv.has('foo'), true);
	t.is(await keyv.has('fizz'), false);
});

test('useGridFS option merges into default options', t => {
	const store = new KeyvMongo({useGridFS: true, collection: 'foo'});
	t.deepEqual(store.opts, {
		url: mongoURL,
		useGridFS: true,
		collection: 'foo',
	});
});

test('Collection option merges into default options if URL is passed', t => {
	const store = new KeyvMongo(mongoURL, {collection: 'foo'});
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
	const store = new KeyvMongo(mongoURL, {collection: 'foo'});
	t.false(await store.delete(123));
});

test.serial('Stores value in GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.set('key1', 'keyv1', 0);
	const get = await store.get('key1');
	t.is(result.filename, 'key1');
	t.is(get, 'keyv1');
});

test.serial('Gets value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.get('key1');
	t.is(result, 'keyv1');
});

test.serial('Deletes value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.delete('key1');
	t.is(result, true);
});

test.serial('Deletes non existent value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.delete('no-existent-value');
	t.is(result, false);
});

test.serial('Stores value with TTL in GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.set('key1', 'keyv1', 0);
	t.is(result.filename, 'key1');
});

test.serial('Clears expired value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const cleared = await store.clearExpired();
	t.is(cleared, true);
});

test.serial('Clears unused files from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
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
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.get('non-existent-file');
	t.is(typeof result, 'undefined');
});

test.serial('Non-string keys are not permitted in delete', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.delete({
		ok: true,
	});
	t.is(result, false);
});

test.serial('.deleteMany([keys]) should delete multiple gridfs key', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	t.is(await keyv.deleteMany(['foo', 'foo1', 'foo2']), true);
	t.is(await keyv.get('foo'), undefined);
	t.is(await keyv.get('foo1'), undefined);
	t.is(await keyv.get('foo2'), undefined);
});

test.serial('.deleteMany([keys]) with nonexistent gridfs keys resolves to false', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	t.is(await keyv.deleteMany(['foo', 'foo1', 'foo2']), false);
});

test.serial('.getMany([keys]) using GridFS should return array values', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.clearUnusedFor(0);
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], 'bar');
	t.is(values[1], 'bar1');
	t.is(values[2], 'bar2');
});

test.serial('.getMany([keys]) using GridFS should return array values with undefined', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.clearUnusedFor(0);
	await keyv.set('foo', 'bar');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], 'bar');
	t.is(values[1], undefined);
	t.is(values[2], 'bar2');
});

test.serial('.getMany([keys]) using GridFS should return empty array for all no existent keys', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.clearUnusedFor(0);
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.deepEqual(values, []);
});

test.serial('Clears entire cache store', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.clear();
	t.is(typeof result, 'undefined');
});

test.serial('Clears entire cache store with default namespace', async t => {
	const store = new KeyvMongo({...options});
	const result = await store.clear();
	t.is(typeof result, 'undefined');
});

test.serial('iterator with default namespace', async t => {
	const store = new KeyvMongo({...options});
	await store.set('foo', 'bar');
	await store.set('foo2', 'bar2');
	const iterator = store.iterator();
	let entry = await iterator.next();
	t.is(entry.value[0], 'foo');
	t.is(entry.value[1], 'bar');
	entry = await iterator.next();
	t.is(entry.value[0], 'foo2');
	t.is(entry.value[1], 'bar2');
	entry = await iterator.next();
	t.is(entry.value, undefined);
});

test.serial('iterator with namespace', async t => {
	const store = new KeyvMongo({namespace: 'key1', ...options});
	await store.set('key1:foo', 'bar');
	await store.set('key1:foo2', 'bar2');
	const iterator = store.iterator('key1');
	let entry = await iterator.next();
	t.is(entry.value[0], 'key1:foo');
	t.is(entry.value[1], 'bar');
	entry = await iterator.next();
	t.is(entry.value[0], 'key1:foo2');
	t.is(entry.value[1], 'bar2');
	entry = await iterator.next();
	t.is(entry.value, undefined);
});
