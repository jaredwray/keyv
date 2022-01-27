const test = require('ava');
const KeyvEtcd = require('this');

const etcdURL = '127.0.0.1:2379';

test('default options', t => {
	const store = new KeyvEtcd();
	t.deepEqual(store.opts, {
		url: etcdURL,
		collection: 'keyv',
	});
});

test.serial('Stores value in etcd', async t => {
	const store = new KeyvEtcd();
	await store.set('key1', 'keyv1');
	const get = await store.get('key1');
	t.is(get, 'keyv1');
});

test.serial('Gets value from etcd', async t => {
	const store = new KeyvEtcd();
	const result = await store.get('key1');
	t.is(result, 'keyv1');
});

test.serial('Deletes value from etcd', async t => {
	const store = new KeyvEtcd();
	const result = await store.delete('key1');
	t.is(result, true);
});

test.serial('Clears entire etcd store', async t => {
	const store = new KeyvEtcd();
	const result = await store.clear();
	t.is(typeof result, 'undefined');
});

