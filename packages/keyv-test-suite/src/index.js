import delay from 'delay';

const keyvApiTests = (test, Keyv, store) => {
	test.beforeEach(async t => {
		const keyv = new Keyv({ store });
		await keyv.clear();
	});

	test.serial('.set(key, value) returns a Promise', t => {
		const keyv = new Keyv({ store });
		t.true(keyv.set('foo', 'bar') instanceof Promise);
	});

	test.serial('.set(key, value) resolves to value', async t => {
		const keyv = new Keyv({ store });
		t.is(await keyv.set('foo', 'bar'), 'bar');
	});

	test.serial('.set(key, value, ttl) sets a value that expires', async t => {
		const keyv = new Keyv({ store });
		t.is(await keyv.set('foo', 'bar', 100), 'bar');
		t.is(await keyv.get('foo'), 'bar');
		await delay(100);
		t.is(await keyv.get('foo'), undefined);
	});

	test.serial('.get(key) returns a Promise', t => {
		const keyv = new Keyv({ store });
		t.true(keyv.get('foo') instanceof Promise);
	});

	test.serial('.get(key) resolves to value', async t => {
		const keyv = new Keyv({ store });
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
	});

	test.serial('.get(key) with nonexistent key resolves to undefined', async t => {
		const keyv = new Keyv({ store });
		t.is(await keyv.get('foo'), undefined);
	});

	test.serial('.get(key) with falsey key resolves to value', async t => {
		const keyv = new Keyv({ store });
		await keyv.set('foo', false);
		t.is(await keyv.get('foo'), false);
	});

	test.serial('.delete(key) returns a Promise', t => {
		const keyv = new Keyv({ store });
		t.true(keyv.delete('foo') instanceof Promise);
	});

	test.serial('.delete(key) resolves to true', async t => {
		const keyv = new Keyv({ store });
		await keyv.set('foo', 'bar');
		t.is(await keyv.delete('foo'), true);
	});

	test.serial('.delete(key) with nonexistent key resolves to false', async t => {
		const keyv = new Keyv({ store });
		t.is(await keyv.delete('foo'), false);
	});

	test.serial('.clear() deletes all key/value pairs', async t => {
		const keyv = new Keyv({ store });
		await keyv.set('foo', 'bar');
		await keyv.set('fizz', 'buzz');
		await keyv.clear();
		t.is(await keyv.get('foo'), undefined);
		t.is(await keyv.get('fizz'), undefined);
	});

	test.after.always(async t => {
		const keyv = new Keyv({ store });
		await keyv.clear();
	});
};

export default keyvApiTests;
