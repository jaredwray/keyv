const test = require('ava');
const KeyvEtcd = require('this');

const etcdURL = 'etcd://127.0.0.1:2379';

test('default options', t => {
	const store = new KeyvEtcd();
	t.deepEqual(store.opts, {
		url: etcdURL,
		collection: 'keyv',
	});
});
