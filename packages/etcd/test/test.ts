import test from 'ava';
import Keyv from 'keyv';
import keyvTestSuite, {keyvOfficialTests} from '@keyv/test-suite';
import KeyvEtcd from '../src/index';

const etcdUrl = 'etcd://127.0.0.1:2379';

keyvOfficialTests(test, Keyv, etcdUrl, 'etcd://foo');

const store = () => new KeyvEtcd({uri: etcdUrl, busyTimeout: 3000});

keyvTestSuite(test, Keyv, store);

test('default options', t => {
	const store = new KeyvEtcd();
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
	});
});

test('enable ttl using default url', t => {
	const store = new KeyvEtcd({ttl: 1000});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: 1000,
	});
	t.is(store.ttlSupport, true);
});

test('disable ttl using default url', t => {
	// @ts-expect-error - ttl is not a number, just for test
	const store = new KeyvEtcd({ttl: true});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: true,
	});
	t.is(store.ttlSupport, false);
});

test('enable ttl using url and options', t => {
	const store = new KeyvEtcd('127.0.0.1:2379', {ttl: 1000});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: 1000,
	});
	t.is(store.ttlSupport, true);
});

test('disable ttl using url and options', t => {
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

test('.delete() with key as number', async t => {
	const store = new KeyvEtcd({uri: etcdUrl});
	// @ts-expect-error - key needs be a string, just for test
	t.false(await store.delete(123));
});

test('.clear() with default namespace', async t => {
	const store = new KeyvEtcd(etcdUrl);
	t.is(await store.clear(), undefined);
});

test('.clear() with namespace', async t => {
	const store = new KeyvEtcd(etcdUrl);
	store.namespace = 'key1';
	await store.set(`${store.namespace}:key`, 'bar');
	t.is(await store.clear(), undefined);
	t.is(await store.get(`${store.namespace}:key`), null);
});

test.serial('close connection successfully', async t => {
	const keyv = new KeyvEtcd(etcdUrl);
	t.is(await keyv.get('foo'), null);
	keyv.disconnect();
	try {
		await keyv.get('foo');
		t.fail();
	} catch {
		t.pass();
	}
});

