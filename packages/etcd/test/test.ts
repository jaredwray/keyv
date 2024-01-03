import test from 'ava';
import Keyv from 'keyv';
import keyvTestSuite, {keyvOfficialTests} from '@keyv/test-suite';
import KeyvEtcd from '../src/index';

const etcdUrl = 'etcd://127.0.0.1:2379';

keyvOfficialTests(test, Keyv, etcdUrl, 'etcd://foo');

const store = () => new KeyvEtcd({uri: etcdUrl, busyTimeout: 3000});

keyvTestSuite(test, Keyv, store);

test.serial('default options', t => {
	const store = new KeyvEtcd();
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
	});
});

test.serial('enable ttl using default url', t => {
	const store = new KeyvEtcd({ttl: 1000});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: 1000,
	});
	t.is(store.ttlSupport, true);
});

test.serial('disable ttl using default url', t => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd({ttl: true});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: true,
	});
	t.is(store.ttlSupport, false);
});

test.serial('enable ttl using url and options', t => {
	const store = new KeyvEtcd('127.0.0.1:2379', {ttl: 1000});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: 1000,
	});
	t.is(store.ttlSupport, true);
});

test.serial('disable ttl using url and options', t => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd('127.0.0.1:2379', {ttl: true});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: true,
	});
	t.is(store.ttlSupport, false);
});

async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

test.serial('KeyvEtcd respects default tll option', async t => {
	const keyv = new KeyvEtcd(etcdUrl, {ttl: 1000});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
	await sleep(3000);
	t.is(await keyv.get('foo'), null);
});

test.serial('.delete() with key as number', async t => {
	const store = new KeyvEtcd({uri: etcdUrl});
	// @ts-expect-error - key needs be a string, just for test
	t.false(await store.delete(123));
});

test.serial('.clear() with default namespace', async t => {
	const store = new KeyvEtcd(etcdUrl);
	t.is(await store.clear(), undefined);
});

test.serial('.clear() with namespace', async t => {
	const store = new KeyvEtcd(etcdUrl);
	store.namespace = 'key1';
	await store.set(`${store.namespace}:key`, 'bar');
	t.is(await store.clear(), undefined);
	t.is(await store.get(`${store.namespace}:key`), null);
});

test.serial('close connection successfully', async t => {
	const keyv = new KeyvEtcd(etcdUrl);
	t.is(await keyv.get('foo'), null);
	await keyv.disconnect();
	try {
		await keyv.get('foo');
		t.fail();
	} catch {
		t.pass();
	}
});

test.serial('iterator with namespace', async t => {
	const store = new KeyvEtcd(etcdUrl);
	store.namespace = 'key1';
	await store.set('key1:foo', 'bar');
	await store.set('key1:foo2', 'bar2');
	const iterator = store.iterator('key1');
	let entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.is(entry.value[0], 'key1:foo');
	// @ts-expect-error - test iterator
	t.is(entry.value[1], 'bar');
	entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.is(entry.value[0], 'key1:foo2');
	// @ts-expect-error - test iterator
	t.is(entry.value[1], 'bar2');
	entry = await iterator.next();
	t.is(entry.value, undefined);
});

test.serial('iterator without namespace', async t => {
	const store = new KeyvEtcd(etcdUrl);
	await store.set('foo', 'bar');
	const iterator = store.iterator();
	const entry = await iterator.next();
	// @ts-expect-error - test iterator
	t.is(entry.value[0], 'foo');
	// @ts-expect-error - test iterator
	t.is(entry.value[1], 'bar');
});

