const fs = require('fs');
const path = require('path');
const test = require('ava');
const {endPool} = require('../src/pool.js');
const KeyvMysql = require('../src/index.js');

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
};

test.serial('throws if ssl is not used', async t => {
	try {
		const keyv = new KeyvMysql({uri: 'mysql://root@localhost:3307/keyv_test'});
		await keyv.get('foo');
		t.fail();
	} catch {
		t.pass();
	} finally {
		endPool();
	}
});

test.serial('set with ssl ', async t => {
	const keyv = new KeyvMysql({uri: 'mysql://root@localhost:3307/keyv_test', ...options});
	await keyv.set('key', 'value');
	t.is(await keyv.get('key'), 'value');
});
