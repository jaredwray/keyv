import test from 'ava';
import keyvTestSuite from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvSequelize from 'this';

const sqliteOpts = {
	dialect: 'sqlite',
	uri: 'sqlite://test/testdb.sqlite'
};

const store = () => new KeyvSequelize(sqliteOpts);
keyvTestSuite(test, Keyv, store);

test.serial.cb('connection errors are emitted', t => {
	const store = new KeyvSequelize({ uri: 'sqlite://non/existent/database.sqlite' });
	const keyv = new Keyv({ store });
	keyv.on('error', () => {
		t.pass();
		t.end();
	});
});
