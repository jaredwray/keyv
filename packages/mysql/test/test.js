const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const {keyvOfficialTests, keyvIteratorTests} = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvMysql = require('../src/index.js');
const {parseConnectionString} = require('../src/pool.js');

keyvOfficialTests(test, Keyv, 'mysql://root@localhost/keyv_test', 'mysql://foo');

const store = () => new KeyvMysql('mysql://root@localhost/keyv_test');
keyvTestSuite(test, Keyv, store);
const iteratorStore = () => new KeyvMysql({uri: 'mysql://root@localhost/keyv_test', iterationLimit: 2});
keyvIteratorTests(test, Keyv, iteratorStore);

test.serial('iterator with default namespace', async t => {
	const keyv = new KeyvMysql({uri: 'mysql://root@localhost/keyv_test'});
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

test.serial('validate connection strings', t => {
	const options = parseConnectionString('mysql://root:password@localhost:3306/keyv_test');
	t.is(options.user, 'root');
	t.is(options.password, 'password');
	t.is(options.host, 'localhost');
	t.is(options.port, 3306);
	t.is(options.database, 'keyv_test');

	const options2 = parseConnectionString('mysql://root-1:pass-1@localhost:3306/dbname');
	t.is(options2.user, 'root-1');
	t.is(options2.password, 'pass-1');
	t.is(options2.host, 'localhost');
	t.is(options2.port, 3306);
	t.is(options2.database, 'dbname');

	const options3 = parseConnectionString('mysql://test_stg:test@test-stg-cluster.cluster-hqpowufs.ap-dqhowd-1.rds.amazonaws.com:3306/test_beta');
	t.is(options3.user, 'test_stg');
	t.is(options3.password, 'test');
	t.is(options3.host, 'test-stg-cluster.cluster-hqpowufs.ap-dqhowd-1.rds.amazonaws.com');
	t.is(options3.port, 3306);
	t.is(options3.database, 'test_beta');
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
