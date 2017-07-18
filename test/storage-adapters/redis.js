import test from 'ava';
import Keyv from '../../';

test('connection string automatically requires module', async t => {
	const keyv = new Keyv('redis://localhost');
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test.cb('connection errors are emitted', t => {
	const keyv = new Keyv('redis://foo');
	keyv.on('error', () => {
		t.pass();
		t.end();
	});
});
