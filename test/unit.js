import test from 'ava';
import delay from 'delay';
import Keyv from '../';

test('Keyv is a class', t => {
	t.is(typeof Keyv, 'function');
	t.throws(() => Keyv()); // eslint-disable-line new-cap
	t.notThrows(() => new Keyv());
});

test('Keyv accepts storage adapters', async t => {
	const store = new Map();
	const keyv = new Keyv({ store });
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
	t.true(store.has('foo'));
});

test('Keyv hands tll functionality over to ttl supporting stores', async t => {
	const store = new Map();
	store.ttlSupport = true;
	const keyv = new Keyv({ store });
	await keyv.set('foo', 'bar', 100);
	t.is(await keyv.get('foo'), 'bar');
	t.is(store.get('foo'), 'bar');
	await delay(100);
	t.is(await keyv.get('foo'), 'bar');
});
