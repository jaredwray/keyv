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

test.serial('.deleteMany([keys]) should delete multiple key', async t => {
	const keyv = new KeyvMysql({ uri: 'mysql://root@localhost/keyv_test' });
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	t.is(await keyv.deleteMany(['foo', 'foo1', 'foo2']), true);
});

test.serial('.deleteMany([keys]) with nonexistent keys resolves to false', async t => {
	const keyv = new KeyvMysql({ uri: 'mysql://root@localhost/keyv_test' });
	t.is(await keyv.deleteMany(['foo', 'foo1', 'foo2']), false);
});
