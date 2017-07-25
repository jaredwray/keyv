import test from 'ava';
import keyvTestSuite from 'keyv-test-suite';
import Keyv from 'get-root-module';

test('connection string automatically requires module', async t => {
	const keyv = new Keyv('mongodb://127.0.0.1:27017');
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test.cb('connection errors are emitted', t => {
	const keyv = new Keyv('mongodb://127.0.0.1:1234');
	keyv.on('error', () => {
		t.pass();
		t.end();
	});
});

const store = new (require('keyv-mongo'))('mongodb://127.0.0.1:27017'); // eslint-disable-line import/newline-after-import
keyvTestSuite(test, Keyv, store);
