import test from 'ava';
import Keyv, {KeyvHooks} from '../src';

test('keyv hooks PRE_SET', async t => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_SET, data => {
		t.is(data.key, 'foo');
		t.is(data.value, 'bar');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.set('foo', 'bar');
});

test('keyv hooks POST_SET', async t => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_SET, data => {
		t.is(data.key, 'keyv:foo');
		t.is(data.value, '{"value":"bar","expires":null}');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.set('foo', 'bar');
});
