import * as test from 'vitest';
import keyvTestSuite, {keyvOfficialTests, keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import {endPool} from '../src/pool';
import KeyvPostgres from '../src/index';

const postgresUri = 'postgresql://postgres:postgres@localhost:5433/keyv_test';

test.beforeEach(async () => {
	const keyv = new KeyvPostgres({uri: postgresUri});
	await keyv.clear();
});

test.it('throws if ssl is not used', async t => {
	await endPool();
	try {
		const keyv = new KeyvPostgres({uri: postgresUri});
		await keyv.get('foo');
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	} finally {
		await endPool();
	}
});

const options = {ssl: {rejectUnauthorized: false}};

keyvOfficialTests(test, Keyv, postgresUri, 'postgresql://foo', options);

const store = () => new KeyvPostgres({uri: postgresUri, iterationLimit: 2, ...options});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.it('iterator with default namespace', async t => {
	const keyv = new KeyvPostgres({uri: postgresUri, ...options});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const iterator = keyv.iterator();
	let entry = await iterator.next();
	t.expect(entry.value[0]).toBe('foo');
	t.expect(entry.value[1]).toBe('bar');
	entry = await iterator.next();
	t.expect(entry.value[0]).toBe('foo1');
	t.expect(entry.value[1]).toBe('bar1');
	entry = await iterator.next();
	t.expect(entry.value[0]).toBe('foo2');
	t.expect(entry.value[1]).toBe('bar2');
	entry = await iterator.next();
	t.expect(entry.value).toBeUndefined();
});

test.it('.clear() with undefined namespace', async t => {
	const keyv = store();
	t.expect(await keyv.clear()).toBeUndefined();
});

test.it('close connection successfully', async t => {
	const keyv = store();
	t.expect(await keyv.get('foo')).toBeUndefined();
	await keyv.disconnect();
	try {
		await keyv.get('foo');
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});
