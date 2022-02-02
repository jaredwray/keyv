const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvSqlite = require('this');

l=keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const store = () => new KeyvSqlite({ uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);

test.serial('Async Iterator test', async t => {
	const keyv = new KeyvSqlite({ uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000 }, { iterationLimit: 1 });
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	const iterator = keyv.iterator();
	for await (const key of iterator) {
		t.assert(key, 'foo');
	}
});
