import test from 'ava';
import delay from 'delay';
import keyvApiTests from 'keyv-api-tests';
import Keyv from '../';

const store = new Map();
keyvApiTests(test, Keyv, store);

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
	t.plan(3);
	const store = new Map();
	store.ttlSupport = true;
	const storeSet = store.set;
	store.set = (key, val, ttl) => {
		t.is(ttl, 100);
		storeSet.call(store, key, val, ttl);
	};
	const keyv = new Keyv({ store });
	await keyv.set('foo', 'bar', 100);
	t.is(await keyv.get('foo'), 'bar');
	await delay(100);
	t.is(await keyv.get('foo'), 'bar');
});

test('Keyv respects default tll option', async t => {
	const store = new Map();
	const keyv = new Keyv({ store, ttl: 100 });
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
	await delay(100);
	t.is(await keyv.get('foo'), undefined);
});

test('.set(key, val, ttl) overwrites default tll option', async t => {
	const store = new Map();
	const keyv = new Keyv({ store, ttl: 100 });
	await keyv.set('foo', 'bar');
	await keyv.set('fizz', 'buzz', 50);
	await keyv.set('ping', 'pong', 150);
	t.is(await keyv.get('foo'), 'bar');
	t.is(await keyv.get('fizz'), 'buzz');
	t.is(await keyv.get('ping'), 'pong');
	await delay(60);
	t.is(await keyv.get('foo'), 'bar');
	t.is(await keyv.get('fizz'), undefined);
	t.is(await keyv.get('ping'), 'pong');
	await delay(50);
	t.is(await keyv.get('foo'), undefined);
	t.is(await keyv.get('ping'), 'pong');
	await delay(50);
	t.is(await keyv.get('ping'), undefined);
});
