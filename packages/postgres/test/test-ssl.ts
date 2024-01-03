import test from 'ava';
import keyvTestSuite, {keyvOfficialTests, keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import {endPool} from '../src/pool';
import KeyvPostgres from '../src/index';

const postgresUri = 'postgresql://postgres:postgres@localhost:5433/keyv_test';

test.serial('throws if ssl is not used', async t => {
	await endPool();
	try {
		const keyv = new KeyvPostgres({uri: postgresUri});
		await keyv.get('foo');
		t.fail();
	} catch {
		t.pass();
	} finally {
		await endPool();
	}
});

const options = {ssl: {rejectUnauthorized: false}};

keyvOfficialTests(test, Keyv, postgresUri, 'postgresql://foo', options);

const store = () => new KeyvPostgres({uri: postgresUri, iterationLimit: 2, ...options});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('iterator with default namespace', async t => {
	const keyv = new KeyvPostgres({uri: postgresUri, ...options});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const iterator = keyv.iterator();
	let entry = await iterator.next();
	t.is(entry.value[0], 'foo');
	t.is(entry.value[1], 'bar');
	entry = await iterator.next();
	t.is(entry.value[0], 'foo1');
	t.is(entry.value[1], 'bar1');
	entry = await iterator.next();
	t.is(entry.value[0], 'foo2');
	t.is(entry.value[1], 'bar2');
	entry = await iterator.next();
	t.is(entry.value, undefined);
});

test.serial('.clear() with undefined namespace', async t => {
	const keyv = store();
	t.is(await keyv.clear(), undefined);
});

test.serial('close connection successfully', async t => {
	const keyv = store();
	t.is(await keyv.get('foo'), undefined);
	await keyv.disconnect();
	try {
		await keyv.get('foo');
		t.fail();
	} catch {
		t.pass();
	}
});
