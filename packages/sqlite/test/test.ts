import test from 'ava';
import keyvTestSuite, {keyvOfficialTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvSqlite from '../src/index';

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});

keyvTestSuite(test, Keyv, store);

test.serial('table name can be numeric, alphabet, special case', t => {
	// @ts-expect-error - table needs to be a string
	let keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', table: 3000});
	t.is(keyv.opts.table, '_3000');

	keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', table: 'sample'});
	t.is(keyv.opts.table, 'sample');

	keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', table: '$sample'});
	t.is(keyv.opts.table, '_$sample');
});

test.serial('getMany will return multiple values', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.deepEqual(values, ['bar', 'bar1', 'bar2']);
});

test.serial('deleteMany will delete multiple records', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.deepEqual(values, ['bar', 'bar1', 'bar2']);
	await keyv.deleteMany(['foo', 'foo1', 'foo2']);
	const values1 = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.deepEqual(values1, [undefined, undefined, undefined]);
});

test.serial('Async Iterator single element test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	const iterator = keyv.iterator();
	for await (const [key, raw] of iterator) {
		t.is(key, 'foo');
		t.is(raw, 'bar');
	}
});

test.serial('Async Iterator multiple element test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000, iterationLimit: 3});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const iterator = keyv.iterator();
	for await (const [key, raw] of iterator) {
		t.assert(key, 'foo');
		t.assert(raw, 'bar');
		t.assert(key, 'foo1');
		t.assert(raw, 'bar1');
		t.assert(key, 'foo2');
		t.assert(raw, 'bar2');
	}
});

test.serial('Async Iterator multiple elements with limit=1 test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000, iterationLimit: 1});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const iterator = keyv.iterator();
	let key = await iterator.next();
	let [k, v] = key.value;
	t.is(k, 'foo');
	t.is(v, 'bar');
	key = await iterator.next();
	[k, v] = key.value;
	t.is(k, 'foo1');
	t.is(v, 'bar1');
	key = await iterator.next();
	[k, v] = key.value;
	t.is(k, 'foo2');
	t.is(v, 'bar2');
});

test.serial('Async Iterator 0 element test', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000, iterationLimit: 1});
	await keyv.clear();
	const iterator = keyv.iterator('keyv');
	const key = await iterator.next();
	t.is(key.value, undefined);
});

test.serial('close connection successfully', async t => {
	const keyv = new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite'});
	await keyv.clear();
	t.is(await keyv.get('foo'), undefined);
	await keyv.set('foo', 'bar');
	// eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
	t.is(await keyv.disconnect(), undefined);
});
