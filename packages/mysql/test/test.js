const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests, keyvIteratorTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvMysql = require('this');

keyvOfficialTests(test, Keyv, 'mysql://root@localhost/keyv_test', 'mysql://foo');

const store = () => new KeyvMysql('mysql://root@localhost/keyv_test');
keyvTestSuite(test, Keyv, store);
const iteratorStore = () => new KeyvMysql({ uri: 'mysql://root@localhost/keyv_test', iterationLimit: 2 });
keyvIteratorTests(test, Keyv, iteratorStore);

test.serial('.getMany([keys]) should return array values', async t => {
	const keyv = new KeyvMysql('mysql://root@localhost/keyv_test');
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
	const keyv = new KeyvMysql('mysql://root@localhost/keyv_test');
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
	const keyv = new KeyvMysql('mysql://root@localhost/keyv_test');
	await keyv.clear();
	const values = await keyv.getMany(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.deepEqual(values, []);
});

