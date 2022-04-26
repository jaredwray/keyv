const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const {keyvOfficialTests, keyvIteratorTests} = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', iterationLimit: 2});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('iterator with default namespace', async t => {
	const keyv = new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test'});
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

