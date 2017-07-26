const keyvNamepsaceTests = (test, Keyv, store) => {
	test.beforeEach(async () => {
		const keyv1 = new Keyv({ store, namespace: 'keyv1' });
		const keyv2 = new Keyv({ store, namespace: 'keyv2' });
		await keyv1.clear();
		await keyv2.clear();
	});

	test.serial('namespaced .set(key, value) don\'t collide', async t => {
		const keyv1 = new Keyv({ store, namespace: 'keyv1' });
		const keyv2 = new Keyv({ store, namespace: 'keyv2' });
		await keyv1.set('foo', 'keyv1');
		await keyv2.set('foo', 'keyv2');
		t.is(await keyv1.get('foo'), 'keyv1');
		t.is(await keyv2.get('foo'), 'keyv2');
	});

	test.after.always(async () => {
		const keyv1 = new Keyv({ store, namespace: 'keyv1' });
		const keyv2 = new Keyv({ store, namespace: 'keyv2' });
		await keyv1.clear();
		await keyv2.clear();
	});
};

export default keyvNamepsaceTests;
