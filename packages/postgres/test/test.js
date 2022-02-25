const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests, keyvIteratorTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', iterationLimit: 2 });
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('.deleteMany([keys]) should delete multiple key', async t => {
	const keyv = new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	t.is(await keyv.deleteMany(['foo', 'foo1', 'foo2']), true);
});

test.serial('.deleteMany([keys]) with nonexistent keys resolves to false', async t => {
	const keyv = new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
	t.is(await keyv.deleteMany(['foo', 'foo1', 'foo2']), false);
});

