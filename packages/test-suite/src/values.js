const keyvValueTests = (test, Keyv, store) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

	test.serial('value can be false', async t => {
		const keyv = new Keyv({ store: store() });
		await keyv.set('foo', false);
		t.is(await keyv.get('foo'), false);
	});

	test.serial('value can be null', async t => {
		const keyv = new Keyv({ store: store() });
		await keyv.set('foo', null);
		t.is(await keyv.get('foo'), null);
	});

	test.serial('value can be undefined', async t => {
		const keyv = new Keyv({ store: store() });
		await keyv.set('foo', undefined);
		t.is(await keyv.get('foo'), undefined);
	});

	test.serial('value can be a number', async t => {
		const keyv = new Keyv({ store: store() });
		await keyv.set('foo', 0);
		t.is(await keyv.get('foo'), 0);
	});

	test.serial('value can be an object', async t => {
		const keyv = new Keyv({ store: store() });
		const value = { fizz: 'buzz' };
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can be a buffer', async t => {
		const keyv = new Keyv({ store: store() });
		const buf = require('buffer').Buffer.from('bar');
		await keyv.set('foo', buf);
		t.true(buf.equals(await keyv.get('foo')));
	});

	test.serial('value can be an object containing a buffer', async t => {
		const keyv = new Keyv({ store: store() });
		const value = { buff: require('buffer').Buffer.from('buzz') };
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can contain quotes', async t => {
		const keyv = new Keyv({ store: store() });
		const value = '"';
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.after.always(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});
};

module.exports = keyvValueTests;
