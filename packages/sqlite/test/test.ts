import * as test from 'vitest';
import Keyv from 'keyv';
import keyvTestSuite from '@keyv/test-suite';
import KeyvSqlite from '../src/index';

const store = () => new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});

keyvTestSuite(test, Keyv, store);

test.beforeEach(async () => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
});

test.it('table name can be numeric, alphabet, special case', t => {
	// @ts-expect-error - table needs to be a string
	let keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', table: 3000});
	t.expect(keyv.opts.table).toBe('_3000');

	keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', table: 'sample'});
	t.expect(keyv.opts.table).toBe('sample');

	keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', table: '$sample'});
	t.expect(keyv.opts.table).toBe('_$sample');
});

test.it('getMany will return multiple values', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.expect(values).toStrictEqual(['bar', 'bar1', 'bar2']);
});

test.it('deleteMany will delete multiple records', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.expect(values).toStrictEqual(['bar', 'bar1', 'bar2']);
	await keyv.deleteMany(['foo', 'foo1', 'foo2']);
	const values1 = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.expect(values1).toStrictEqual([undefined, undefined, undefined]);
});

test.it('Async Iterator single element test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	const iterator = keyv.iterator();
	for await (const [key, raw] of iterator) {
		t.expect(key).toBe('foo');
		t.expect(raw).toBe('bar');
	}
});

test.it('Async Iterator multiple element test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000, iterationLimit: 3});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const expectedEntries = [['foo', 'bar'], ['foo1', 'bar1'], ['foo2', 'bar2']];
	const iterator = keyv.iterator();
	let i = 0;
	for await (const [key, raw] of iterator) {
		const [expectedKey, expectedRaw] = expectedEntries[i++];
		t.expect(key).toBe(expectedKey);
		t.expect(raw).toBe(expectedRaw);
	}
});

test.it('Async Iterator multiple elements with limit=1 test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000, iterationLimit: 1});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const iterator = keyv.iterator();
	let key = await iterator.next();
	let [k, v] = key.value;
	t.expect(k).toBe('foo');
	t.expect(v).toBe('bar');
	key = await iterator.next();
	[k, v] = key.value;
	t.expect(k).toBe('foo1');
	t.expect(v).toBe('bar1');
	key = await iterator.next();
	[k, v] = key.value;
	t.expect(k).toBe('foo2');
	t.expect(v).toBe('bar2');
});

test.it('Async Iterator 0 element test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000, iterationLimit: 1});
	await keyv.clear();
	const iterator = keyv.iterator('keyv');
	const key = await iterator.next();
	t.expect(key.value).toBe(undefined);
});

test.it('close connection successfully', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite'});
	t.expect(await keyv.get('foo')).toBe(undefined);
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
	await keyv.disconnect();
	try {
		await keyv.get('foo');
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});
