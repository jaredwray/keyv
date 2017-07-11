import test from 'ava';
import delay from 'delay';
import Keyv from '../';

const store = new Map();

test.serial('.set(key, value) returns a Promise', t => {
	const keyv = new Keyv({ store });
	t.true(keyv.set('foo', 'bar') instanceof Promise);
});

test.serial('.set(key, value) resolves to value', async t => {
	const keyv = new Keyv({ store });
	t.is(await keyv.set('foo', 'bar'), 'bar');
});

test.serial('.set(key, value, ttl) sets a value that expires', async t => {
	const keyv = new Keyv({ store });
	t.is(await keyv.set('foo', 'bar', 100), 'bar');
	t.is(await keyv.get('foo'), 'bar');
	await delay(100);
	t.is(await keyv.get('foo'), undefined);
});

test.serial('.get(key) returns a Promise', t => {
	const keyv = new Keyv({ store });
	t.true(keyv.get('foo') instanceof Promise);
});

test.serial('.get(key) resolves to value', async t => {
	const keyv = new Keyv({ store });
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test.serial('.get(key) with nonexistent key resolves to undefined', async t => {
	const keyv = new Keyv({ store });
	await keyv.delete('foo');
	t.is(await keyv.get('foo'), undefined);
});

test.serial('.delete(key) returns a Promise', t => {
	const keyv = new Keyv({ store });
	t.true(keyv.delete('foo') instanceof Promise);
});

test.serial('.delete(key) resolves to true', async t => {
	const keyv = new Keyv({ store });
	await keyv.set('foo', 'bar');
	t.is(await keyv.delete('foo'), true);
});

test.serial('.delete(key) with nonexistent key resolves to false', async t => {
	const keyv = new Keyv({ store });
	t.is(await keyv.delete('foo'), false);
});
