const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests, keyvIteratorTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', iterationLimit: 2 });
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('.getMany([keys]) should return array values', async t => {
	const keyv = new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], 'bar');
	t.is(values[1], 'bar1');
	t.is(values[2], 'bar2');
});

test.serial('.getMany([keys]) should return array values with undefined', async t => {
	const keyv = new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], 'bar');
	t.is(values[1], undefined);
	t.is(values[2], 'bar2');
});

test.serial('.getMany([keys]) should return empty array for all no existent keys', async t => {
	const keyv = new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
	await keyv.clear();
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.deepEqual(values, []);
});

