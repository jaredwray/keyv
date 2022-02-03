const keyvIteratorTests = (test, Keyv, store) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

	test.serial('Async Iterator single element test', async t => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
		await keyv.set('foo', 'bar');
		const iterator = keyv.iterator();
		for await (const [key, value] of iterator) {
			t.is(key, 'foo');
			t.is(value, 'bar');
		}
	});

	test.serial('Async Iterator multiple elements test', async t => {
		const keyv = new Keyv({ store: store(), iterationLimit: 3 });
		await keyv.clear();
		await keyv.set('foo', 'bar');
		await keyv.set('foo1', 'bar1');
		await keyv.set('foo2', 'bar2');
		const iterator = keyv.iterator();
		for await (const key of iterator) {
			t.assert(key, 'foo');
			t.assert(key, 'foo1');
			t.assert(key, 'foo2');
		}
	});

	test.serial('Async Iterator multiple elements with limit=1 test', async t => {
		const keyv = new Keyv({ store: store(), iterationLimit: 1 });
		await keyv.clear();
		await keyv.set('foo', 'bar');
		await keyv.set('foo1', 'bar1');
		await keyv.set('foo2', 'bar2');
		const iterator = keyv.iterator();
		let key = await iterator.next();
		t.is(key[0], 'foo');
		t.is(key[1], 'bar');
		key = await iterator.next();
		t.is(key[0], 'foo1');
		t.is(key[1], 'bar1');
		key = await iterator.next();
		t.is(key[0], 'foo2');
		t.is(key[1], 'bar2');
	});

	test.serial('Async Iterator 0 element test', async t => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
		const iterator = keyv.iterator();
		const key = await iterator.next();
		t.is(key, undefined);
	});

	test.after.always(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});
};

module.exports = keyvIteratorTests;
