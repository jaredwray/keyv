const keyvNamepsaceTests = (test, Keyv, store) => {
	test.beforeEach(async () => {
		const keyv1 = new Keyv({ store: store(), namespace: 'keyv1' });
		const keyv2 = new Keyv({ store: store(), namespace: 'keyv2' });
		await keyv1.clear();
		await keyv2.clear();
	});

	test.serial('namespaced set/get don\'t collide', async t => {
		const keyv1 = new Keyv({ store: store(), namespace: 'keyv1' });
		const keyv2 = new Keyv({ store: store(), namespace: 'keyv2' });
		await keyv1.set('foo', 'keyv1');
		await keyv2.set('foo', 'keyv2');
		t.is(await keyv1.get('foo'), 'keyv1');
		t.is(await keyv2.get('foo'), 'keyv2');
	});

	test.serial('namespaced delete only deletes from current namespace', async t => {
		const keyv1 = new Keyv({ store: store(), namespace: 'keyv1' });
		const keyv2 = new Keyv({ store: store(), namespace: 'keyv2' });
		await keyv1.set('foo', 'keyv1');
		await keyv2.set('foo', 'keyv2');
		t.is(await keyv1.delete('foo'), true);
		t.is(await keyv1.get('foo'), undefined);
		t.is(await keyv2.get('foo'), 'keyv2');
	});

	test.serial('namespaced clear only clears current namespace', async t => {
		const keyv1 = new Keyv({ store: store(), namespace: 'keyv1' });
		const keyv2 = new Keyv({ store: store(), namespace: 'keyv2' });
		await keyv1.set('foo', 'keyv1');
		await keyv1.set('bar', 'keyv1');
		await keyv2.set('foo', 'keyv2');
		await keyv2.set('bar', 'keyv2');
		await keyv1.clear();
		t.is(await keyv1.get('foo'), undefined);
		t.is(await keyv1.get('bar'), undefined);
		t.is(await keyv2.get('foo'), 'keyv2');
		t.is(await keyv2.get('bar'), 'keyv2');
	});

	test.after.always(async () => {
		const keyv1 = new Keyv({ store: store(), namespace: 'keyv1' });
		const keyv2 = new Keyv({ store: store(), namespace: 'keyv2' });
		await keyv1.clear();
		await keyv2.clear();
	});
};

export default keyvNamepsaceTests;
