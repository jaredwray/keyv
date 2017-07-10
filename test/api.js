import test from 'ava';
import delay from 'delay';
import Keyv from '../';

test('.set(key, value) returns a Promise', t => {
	const store = new Keyv();
	t.true(store.set('foo', 'bar') instanceof Promise);
});

test('.set(key, value) resolves to value', async t => {
	const store = new Keyv();
	t.is(await store.set('foo', 'bar'), 'bar');
});

test('.set(key, value, ttl) sets a value that expires', async t => {
	const store = new Keyv();
	t.is(await store.set('foo', 'bar', 100), 'bar');
	t.is(await store.get('foo'), 'bar');
	await delay(100);
	t.is(await store.get('foo'), undefined);
});

test('.get(key) returns a Promise', t => {
	const store = new Keyv();
	t.true(store.get('foo') instanceof Promise);
});

test('.get(key) resolves to value', async t => {
	const store = new Keyv();
	await store.set('foo', 'bar');
	t.is(await store.get('foo'), 'bar');
});

test('.get(key) with nonexistent key resolves to undefined', async t => {
	const store = new Keyv();
	t.is(await store.get('foo'), undefined);
});

test('.delete(key) returns a Promise', t => {
	const store = new Keyv();
	t.true(store.delete('foo') instanceof Promise);
});

test('.delete(key) resolves to true', async t => {
	const store = new Keyv();
	await store.set('foo', 'bar');
	t.is(await store.delete('foo'), true);
});

test('.delete(key) with nonexistent key resolves to false', async t => {
	const store = new Keyv();
	t.is(await store.delete('foo'), false);
});
