const test = require('ava');
const KeyvEtcd = require('this');
const Keyv = require('keyv');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests } = require('@keyv/test-suite');

const etcdURL = 'etcd://127.0.0.1:2379';

keyvOfficialTests(test, Keyv, etcdURL, 'etcd://foo');

const store = () => new KeyvEtcd({ uri: etcdURL, busyTimeout: 3000 });

keyvTestSuite(test, Keyv, store);

test('default options', t => {
	const store = new KeyvEtcd();
	t.deepEqual(store.opts, {
		url: '127.0.0.1:2379',
	});
});

test('.delete() with key as number', async t => {
	const store = new KeyvEtcd(etcdURL);
	t.false(await store.delete(123));
});

