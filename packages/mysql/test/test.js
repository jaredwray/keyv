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

test.serial('.has(key) where key is the key we are looking for', async t => {
	const keyv = new KeyvMysql({ uri: 'mysql://root@localhost/keyv_test' });
	await keyv.set('foo', 'bar');
	t.is(await keyv.has('foo'), true);
	t.is(await keyv.has('fizz'), false);
});
