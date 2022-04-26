const test = require('ava');
const KeyvEtcd = require('this');
const Keyv = require('keyv');
const keyvTestSuite = require('@keyv/test-suite').default;
const {keyvOfficialTests} = require('@keyv/test-suite');

const etcdURL = 'etcd://127.0.0.1:2379';

keyvOfficialTests(test, Keyv, etcdURL, 'etcd://foo');

const store = () => new KeyvEtcd({uri: etcdURL, busyTimeout: 3000});

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
	const store = new KeyvEtcd('127.0.0.1:2379', {ttl: true});
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
		ttl: true,
	});
	t.is(store.ttlSupport, false);
});

function sleep(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

test.serial('KeyvEtcd respects default tll option', async t => {
	const store = new Map();
	const keyv = new KeyvEtcd({store, ttl: 1000});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
	await sleep(3000);
	t.is(await keyv.get('foo'), null);
	t.is(store.size, 0);
});

test('.delete() with key as number', async t => {
	const store = new KeyvEtcd(etcdURL);
	t.false(await store.delete(123));
});

test('.clear() with default namespace', async t => {
	const store = new KeyvEtcd(etcdURL);
	t.is(await store.clear(), undefined);
});

test('.clear() with namespace', async t => {
	const store = new KeyvEtcd(etcdURL);
	store.namespace = 'key1';
	await store.set(store.namespace + ':key', 'bar');
	t.is(await store.clear(), undefined);
	t.is(await store.get(store.namespace + ':key'), null);
});

