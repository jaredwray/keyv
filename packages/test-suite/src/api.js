const tk = require('timekeeper');

const keyvApiTests = (test, Keyv, store) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({store: store()});
		await keyv.clear();
	});

	test.serial('.set(key, value) returns a Promise', t => {
		const keyv = new Keyv({store: store()});
		t.true(keyv.set('foo', 'bar') instanceof Promise);
	});

	test.serial('.set(key, value) resolves to true', async t => {
		const keyv = new Keyv({store: store()});
		t.is(await keyv.set('foo', 'bar'), true);
	});

	test.serial('.set(key, value) sets a value', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
	});

	test.serial('.set(key, value, ttl) sets a value that expires', async t => {
		const ttl = 1000;
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar', ttl);
		t.is(await keyv.get('foo'), 'bar');
		tk.freeze(Date.now() + ttl + 1);

		t.is(await keyv.get('foo'), undefined);
		tk.reset();
	});

	test.serial('.get(key) returns a Promise', t => {
		const keyv = new Keyv({store: store()});
		t.true(keyv.get('foo') instanceof Promise);
	});

	test.serial('.get(key) resolves to value', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
	});

	test.serial('.get(key) with nonexistent key resolves to undefined', async t => {
		const keyv = new Keyv({store: store()});
		t.is(await keyv.get('foo'), undefined);
	});

	test.serial('.get([keys]) should return array values', async t => {
		const keyv = new Keyv({store: store()});
		const ttl = 3000;
		await keyv.set('foo', 'bar', ttl);
		await keyv.set('foo1', 'bar1', ttl);
		await keyv.set('foo2', 'bar2', ttl);
		const values = await keyv.get(['foo', 'foo1', 'foo2']);
		t.is(Array.isArray(values), true);
		t.is(values[0], 'bar');
		t.is(values[1], 'bar1');
		t.is(values[2], 'bar2');
	});

	test.serial('.get([keys]) should return array value undefined when expires', async t => {
		const keyv = new Keyv({store: new Map()});
		await keyv.set('foo', 'bar');
		await keyv.set('foo1', 'bar1', 1);
		await keyv.set('foo2', 'bar2');
		await new Promise(resolve => {
			setTimeout(() => {
				// Simulate database latency
				resolve();
			}, 30);
		});
		const values = await keyv.get(['foo', 'foo1', 'foo2']);
		t.is(Array.isArray(values), true);
		t.is(values[0], 'bar');
		t.is(values[1], undefined);
		t.is(values[2], 'bar2');
	});

	test.serial('.get([keys]) should return array values with undefined', async t => {
		const keyv = new Keyv({store: store()});
		const ttl = 3000;
		await keyv.set('foo', 'bar', ttl);
		await keyv.set('foo2', 'bar2', ttl);
		const values = await keyv.get(['foo', 'foo1', 'foo2']);
		t.is(Array.isArray(values), true);
		t.is(values[0], 'bar');
		t.is(values[1], undefined);
		t.is(values[2], 'bar2');
	});

	test.serial('.get([keys]) should return empty array for all no existent keys', async t => {
		const keyv = new Keyv({store: store()});
		const values = await keyv.get(['foo', 'foo1', 'foo2']);
		t.is(Array.isArray(values), true);
		t.deepEqual(values, []);
	});

	test.serial('.delete(key) returns a Promise', t => {
		const keyv = new Keyv({store: store()});
		t.true(keyv.delete('foo') instanceof Promise);
	});

	test.serial('.delete([key]) returns a Promise', t => {
		const keyv = new Keyv({store: store()});
		t.true(keyv.delete(['foo', 'foo1']) instanceof Promise);
	});

	test.serial('.delete(key) resolves to true', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		t.is(await keyv.delete('foo'), true);
	});

	test.serial('.delete(key) with nonexistent key resolves to false', async t => {
		const keyv = new Keyv({store: store()});
		t.is(await keyv.delete('foo'), false);
	});

	test.serial('.delete(key) deletes a key', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		t.is(await keyv.delete('foo'), true);
		t.is(await keyv.get('foo'), undefined);
	});

	test.serial('.deleteMany([keys]) should delete multiple key', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		await keyv.set('foo1', 'bar1');
		await keyv.set('foo2', 'bar2');
		t.is(await keyv.delete(['foo', 'foo1', 'foo2']), true);
		t.is(await keyv.get('foo'), undefined);
		t.is(await keyv.get('foo1'), undefined);
		t.is(await keyv.get('foo2'), undefined);
	});

	test.serial('.deleteMany([keys]) with nonexistent keys resolves to false', async t => {
		const keyv = new Keyv({store: store()});
		t.is(await keyv.delete(['foo', 'foo1', 'foo2']), false);
	});

	test.serial('.clear() returns a Promise', async t => {
		const keyv = new Keyv({store: store()});
		const returnValue = keyv.clear();
		t.true(returnValue instanceof Promise);
		await returnValue;
	});

	test.serial('.clear() resolves to undefined', async t => {
		const keyv = new Keyv({store: store()});
		t.is(await keyv.clear(), undefined);
		await keyv.set('foo', 'bar');
		t.is(await keyv.clear(), undefined);
	});

	test.serial('.clear() deletes all key/value pairs', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		await keyv.set('fizz', 'buzz');
		await keyv.clear();
		t.is(await keyv.get('foo'), undefined);
		t.is(await keyv.get('fizz'), undefined);
	});

	test.serial('.has(key) where key is the key we are looking for', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		t.is(await keyv.has('foo'), true);
		t.is(await keyv.has('fizz'), false);
	});

	test.after.always(async () => {
		const keyv = new Keyv({store: store()});
		await keyv.clear();
	});
};

module.exports = keyvApiTests;
