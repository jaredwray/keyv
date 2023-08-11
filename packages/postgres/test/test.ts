import test from 'ava';
import keyvTestSuite, {keyvOfficialTests, keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvPostgres from '../src/index';

const postgresUri = 'postgresql://postgres:postgres@localhost:5432/keyv_test';

keyvOfficialTests(test, Keyv, postgresUri, 'postgresql://foo');

const store = () => new KeyvPostgres({uri: postgresUri, iterationLimit: 2});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('test schema as non public', async t => {
	const keyv1 = new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', schema: 'keyvtest1'});
	const keyv2 = new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', schema: 'keyvtest2'});
	await keyv1.set('footest11', 'bar1');
	await keyv2.set('footest22', 'bar2');
	t.is(await keyv1.get('footest11'), 'bar1');
	t.is(await keyv2.get('footest22'), 'bar2');
});

test.serial('iterator with default namespace', async t => {
	const keyv = new KeyvPostgres({uri: postgresUri});
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
