import test from 'ava';
import Keyv from '../src/index';

test('object exists', t => {
	const keyv = new Keyv();
	t.truthy(keyv);
});

test('Keyv can work with just Map() as default', async t => {
	const keyv = new Keyv();
	keyv.set('foo', 'bar');
	const val = await keyv.get<string>('foo')
	t.is(val, 'bar');
});
