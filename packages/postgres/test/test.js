const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests, keyvIteratorTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvPostgres = require('this');

keyvOfficialTests(test, Keyv, 'postgresql://postgres:postgres@localhost:5432/keyv_test', 'postgresql://foo');

const store = () => new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test', iterationLimit: 2 });
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('.has(key) where key is the key we are looking for', async t => {
	const keyv = new KeyvPostgres({ uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test' });
	await keyv.set('foo', 'bar');
	t.is(await keyv.has('foo'), true);
	t.is(await keyv.has('fizz'), false);
});

