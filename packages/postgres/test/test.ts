import * as test from 'vitest';
import keyvTestSuite, {keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvPostgres from '../src/index';

const postgresUri = 'postgresql://postgres:postgres@localhost:5432/keyv_test';

const store = () => new KeyvPostgres({uri: postgresUri, iterationLimit: 2});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.beforeEach(async () => {
	const keyv = store();
	await keyv.clear();
});

test.it('test schema as non public', async t => {
	const keyv1 = new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', schema: 'keyvtest1'});
	const keyv2 = new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', schema: 'keyvtest2'});
	await keyv1.set('footest11', 'bar1');
	await keyv2.set('footest22', 'bar2');
	t.expect(await keyv1.get('footest11')).toBe('bar1');
	t.expect(await keyv2.get('footest22')).toBe('bar2');
});

test.it('iterator with default namespace', async t => {
	const keyv = new KeyvPostgres({uri: postgresUri});
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
