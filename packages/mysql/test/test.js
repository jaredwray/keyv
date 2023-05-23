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

const connectionSamples = [
	{
		username: 'root',
		password: 'password',
		host: 'localhost',
		port: 3306,
		database: 'keyv_dbname',
	},
	{
		username: 'root',
		password: 'password',
		host: '127.0.0.1',
		port: 3306,
		database: 'keyv_dbname',
	},
	{
		username: 'test user',
		password: 'very strong pass-word',
		host: 'test-stg-cluster.cluster-hqpowufs.ap-dqhowd-1.rds.amazonaws.com',
		port: 5006,
		database: 'keyv_dbname',
	},
	{
		// Special characters
		username: 'John Noêl',
		password: 'f.[;@4IWS0,vv)X-dDe FLn+Ün',
		host: '[::1]',
		port: 3306,
		database: 'keyv_dbname',
	},
	{
		// No password
		username: 'nopassword',
		host: '[::1]',
		port: 3306,
		database: 'keyv_dbname',
	},
	{
		// No port
		username: 'noport',
		password: 'f.[;@4IWS0,vv)X-dDe#Ln+Ün',
		host: '[::1]',
		database: 'keyv_dbname',
	},
	{
		// No password & no port
		username: 'nopasswordnoport',
		host: '[::1]',
		database: 'tablau-èdd',
	},
];

test.serial('validate connection strings', t => {
	for (const connection of connectionSamples) {
		const newConnectionString = `mysql://${connection.username}:${connection.password || ''}@${connection.host}:${connection.port || ''}/${connection.database}`;
		const parsedConnection = parseConnectionString(newConnectionString);

		t.is(parsedConnection.user, connection.username);
		t.is(parsedConnection.password, connection.password);
		t.is(parsedConnection.host, connection.host);
		t.is(parsedConnection.port, connection.port);
		t.is(parsedConnection.database, connection.database);
	}
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
