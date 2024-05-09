import * as test from 'vitest';
import keyvTestSuite, {keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvMongo from '../src/index';

const options = {useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 5000};
const mongoURL = 'mongodb://127.0.0.1:27017';
const store = () => new KeyvMongo(mongoURL, options);

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.afterAll(async () => {
	let keyv = new KeyvMongo({...options});
	await keyv.clear();
	keyv = new KeyvMongo({collection: 'foo', useGridFS: true, ...options});
	await keyv.clear();
});

test.beforeEach(async () => {
	const keyv = new KeyvMongo({...options});
	await keyv.clear();
});

test.it('Collection option merges into default options if URL is passed', t => {
	const store = new KeyvMongo(mongoURL, {collection: 'foo'});
	t.expect(store.opts).toEqual({
		url: mongoURL,
		collection: 'foo',
	});
});

test.it('.delete() with no args doesn\'t empty the collection', async t => {
	const store = new KeyvMongo('mongodb://foo'); // Make sure we don't actually connect
	// @ts-expect-error - test invalid input
	t.expect(await store.delete()).toBeFalsy();
});

test.it('.delete() with key as number', async t => {
	const store = new KeyvMongo(mongoURL, {collection: 'foo'});
	// @ts-expect-error - test invalid input
	t.expect(await store.delete(123)).toBeFalsy();
});

test.it('Stores value in GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.set('key1', 'keyv1', 0);
	const get = await store.get('key1');
	t.expect((result as any).filename).toBe('key1');
	t.expect(get).toBe('keyv1');
});

test.it('Gets value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.get('key1');
	t.expect(result).toBe('keyv1');
});

test.it('Deletes value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.delete('key1');
	t.expect(result).toBeTruthy();
});

test.it('Deletes non existent value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.delete('no-existent-value');
	t.expect(result).toBeFalsy();
});

test.it('Stores value with TTL in GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.set('key1', 'keyv1', 0);
	t.expect((result as any).filename).toBe('key1');
});

test.it('Clears expired value from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeTruthy();
});

test.it('Clears unused files from GridFS', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const cleared = await store.clearUnusedFor(5);
	t.expect(cleared).toBeTruthy();
});

test.it('Clears expired value only when GridFS options is true', async t => {
	const store = new KeyvMongo(Object.assign(options));
	const cleared = await store.clearExpired();
	t.expect(cleared).toBeFalsy();
});

test.it('Clears unused files only when GridFS options is true', async t => {
	const store = new KeyvMongo(Object.assign(options));
	const cleared = await store.clearUnusedFor(5);
	t.expect(cleared).toBeFalsy();
});

test.it('Gets non-existent file and return should be undefined', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.get('non-existent-file');
	t.expect(typeof result).toBe('undefined');
});

test.it('Non-string keys are not permitted in delete', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	// @ts-expect-error - test invalid input
	const result = await store.delete({
		ok: true,
	});
	t.expect(result).toBeFalsy();
});

test.it('.deleteMany([keys]) should delete multiple gridfs key', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	t.expect(await keyv.deleteMany(['foo', 'foo1', 'foo2'])).toBeTruthy();
	t.expect(await keyv.get('foo')).toBeUndefined();
	t.expect(await keyv.get('foo1')).toBeUndefined();
	t.expect(await keyv.get('foo2')).toBeUndefined();
});

test.it('.deleteMany([keys]) with nonexistent gridfs keys resolves to false', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	t.expect(await keyv.deleteMany(['foo', 'foo1', 'foo2'])).toBeFalsy();
});

test.it('.getMany([keys]) using GridFS should return array values', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.clearUnusedFor(0);
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe('bar');
	t.expect(values[1]).toBe('bar1');
	t.expect(values[2]).toBe('bar2');
});

test.it('.getMany([keys]) using GridFS should return array values with undefined', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.clearUnusedFor(0);
	await keyv.set('foo', 'bar');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values[0]).toBe('bar');
	t.expect(values[1]).toBeUndefined();
	t.expect(values[2]).toBe('bar2');
});

test.it('.getMany([keys]) using GridFS should return empty array for all no existent keys', async t => {
	const keyv = new KeyvMongo({useGridFS: true, ...options});
	await keyv.clearUnusedFor(0);
	const values = await keyv.getMany<string>(['foo', 'foo1', 'foo2']);
	t.expect(Array.isArray(values)).toBeTruthy();
	t.expect(values).toStrictEqual([undefined, undefined, undefined]);
});

test.it('Clears entire cache store', async t => {
	const store = new KeyvMongo({useGridFS: true, ...options});
	const result = await store.clear();
	t.expect(typeof result).toBe('undefined');
});

test.it('Clears entire cache store with default namespace', async t => {
	const store = new KeyvMongo({...options});
	const result = await store.clear();
	t.expect(typeof result).toBe('undefined');
});

test.it('iterator with default namespace', async t => {
	const store = new KeyvMongo({...options});
	await store.set('foo', 'bar');
	await store.set('foo2', 'bar2');
	const iterator = store.iterator();
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe('foo');
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe('bar');
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe('foo2');
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe('bar2');
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it('iterator with namespace', async t => {
	const store = new KeyvMongo({namespace: 'key1', ...options});
	await store.set('key1:foo', 'bar');
	await store.set('key1:foo2', 'bar2');
	const iterator = store.iterator('key1');
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe('key1:foo');
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe('bar');
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.expect(entry.value[0]).toBe('key1:foo2');
	// @ts-expect-error - test iterator
	t.expect(entry.value[1]).toBe('bar2');
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});
