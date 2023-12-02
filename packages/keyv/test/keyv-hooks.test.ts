import test from 'ava';
import KeyvSqlite from '@keyv/sqlite';
import Keyv, {KeyvHooks} from '../src';

test('PRE_SET hook', async t => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_SET, data => {
		t.is(data.key, 'foo');
		t.is(data.value, 'bar');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.set('foo', 'bar');
});

test('POST_SET hook', async t => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_SET, data => {
		t.is(data.key, 'keyv:foo');
		t.is(data.value, '{"value":"bar","expires":null}');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.set('foo', 'bar');
});

test('PRE_GET_MANY hook', async t => {
	const keyv = new Keyv();
	const keys = ['foo', 'foo1'];
	keyv.hooks.addHandler(KeyvHooks.PRE_GET_MANY, data => {
		t.is(data.keys[0], 'keyv:foo');
		t.is(data.keys[1], 'keyv:foo1');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.get(keys);
});

test('PRE_GET_MANY with manipulation', async t => {
	const keyv = new Keyv();
	const keys = ['foo', 'foo1'];
	keyv.hooks.addHandler(KeyvHooks.PRE_GET_MANY, data => {
		t.is(data.keys[0], 'keyv:foo');
		t.is(data.keys[1], 'keyv:foo1');

		data.keys[0] = 'keyv:fake';
	});
	t.is(keyv.hooks.handlers.size, 1);
	const values = await keyv.get(keys);
	t.is(values[0], undefined);
});

test('POST_GET_MANY with no getMany function', async t => {
	const keyv = new Keyv();
	const keys = ['foo', 'foo1'];
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	keyv.hooks.addHandler(KeyvHooks.POST_GET_MANY, data => {
		t.is(data[0], 'bar');
		t.is(data[1], 'bar1');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.get(keys);
});

test('POST_GET_MANY with manipulation', async t => {
	const keyv = new Keyv();
	const keys = ['foo', 'foo1'];
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	keyv.hooks.addHandler(KeyvHooks.POST_GET_MANY, data => {
		t.is(data[0], 'bar');
		t.is(data[1], 'bar1');
		data[1] = 'fake';
	});
	t.is(keyv.hooks.handlers.size, 1);
	const values = await keyv.get(keys);
	t.is(values[1], 'fake');
});

test('POST_GET_MANY with getMany function', async t => {
	const keyvSqlite = new KeyvSqlite({uri: 'sqlite://test.db'});
	const keyv = new Keyv({store: keyvSqlite});
	const keys = ['foo', 'foo1'];
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	keyv.hooks.addHandler(KeyvHooks.POST_GET_MANY, data => {
		t.is(data[0], 'bar');
		t.is(data[1], 'bar1');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.get(keys);
});

test('PRE_DELETE hook', async t => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.PRE_DELETE, data => {
		t.is(data.key, 'foo');
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.set('foo', 'bar');
	await keyv.delete('foo');
});

test('POST_DELETE hook', async t => {
	const keyv = new Keyv();
	keyv.hooks.addHandler(KeyvHooks.POST_DELETE, data => {
		t.is(data, true);
	});
	t.is(keyv.hooks.handlers.size, 1);
	await keyv.set('foo', 'bar');
	await keyv.delete('foo');
});
