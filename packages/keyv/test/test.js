const test = require('ava');
const {default: keyvTestSuite, keyvOfficialTests, keyvIteratorTests} = require('@keyv/test-suite');
const tk = require('timekeeper');
const KeyvSqlite = require('@keyv/sqlite');
const KeyvMongo = require('@keyv/mongo');
const KeyvBrotli = require('@keyv/compress-brotli');
const KeyvGzip = require('@keyv/compress-gzip');
const KeyvMemcache = require('@keyv/memcache');
const Keyv = require('../src/index.js');

const keyvMemcache = new KeyvMemcache('localhost:11211');

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');
const store = () => new KeyvSqlite({uri: 'sqlite://test/testdb.sqlite', busyTimeout: 3000});
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('Keyv is a class', t => {
	t.is(typeof Keyv, 'function');
	t.throws(() => Keyv()); // eslint-disable-line new-cap
	t.notThrows(() => new Keyv());
});

test.serial('Keyv accepts storage adapters', async t => {
	const store = new Map();
	const keyv = new Keyv({store});
	t.is(store.size, 0);
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
	t.deepEqual(await keyv.get('foo', {raw: true}), {value: 'bar', expires: null});
	t.is(store.size, 1);
});

test.serial('Keyv passes tll info to stores', async t => {
	t.plan(1);
	const store = new Map();
	const storeSet = store.set;
	store.set = (key, value, ttl) => {
		t.is(ttl, 100);
		storeSet.call(store, key, value, ttl);
	};

	const keyv = new Keyv({store});
	await keyv.set('foo', 'bar', 100);
});

test.serial('Keyv respects default tll option', async t => {
	const store = new Map();
	const keyv = new Keyv({store, ttl: 100});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
	tk.freeze(Date.now() + 150);
	t.is(await keyv.get('foo'), undefined);
	t.is(store.size, 0);
	tk.reset();
});

test.serial('.set(key, val, ttl) overwrites default tll option', async t => {
	const startTime = Date.now();
	tk.freeze(startTime);
	const store = new Map();
	const keyv = new Keyv({store, ttl: 200});
	await keyv.set('foo', 'bar');
	await keyv.set('fizz', 'buzz', 100);
	await keyv.set('ping', 'pong', 300);
	t.is(await keyv.get('foo'), 'bar');
	t.is(await keyv.get('fizz'), 'buzz');
	t.is(await keyv.get('ping'), 'pong');
	tk.freeze(startTime + 150);
	t.is(await keyv.get('foo'), 'bar');
	t.is(await keyv.get('fizz'), undefined);
	t.is(await keyv.get('ping'), 'pong');
	tk.freeze(startTime + 250);
	t.is(await keyv.get('foo'), undefined);
	t.is(await keyv.get('ping'), 'pong');
	tk.freeze(startTime + 350);
	t.is(await keyv.get('ping'), undefined);
	tk.reset();
});

test.serial('.set(key, val, ttl) where ttl is "0" overwrites default tll option and sets key to never expire', async t => {
	const startTime = Date.now();
	tk.freeze(startTime);
	const store = new Map();
	const keyv = new Keyv({store, ttl: 200});
	await keyv.set('foo', 'bar', 0);
	t.is(await keyv.get('foo'), 'bar');
	tk.freeze(startTime + 250);
	t.is(await keyv.get('foo'), 'bar');
	tk.reset();
});

test.serial('.get(key, {raw: true}) returns the raw object instead of the value', async t => {
	const store = new Map();
	const keyv = new Keyv({store});
	await keyv.set('foo', 'bar');
	const value = await keyv.get('foo');
	const rawObject = await keyv.get('foo', {raw: true});
	t.is(value, 'bar');
	t.is(rawObject.value, 'bar');
});

test.serial('Keyv uses custom serializer when provided instead of json-buffer', async t => {
	t.plan(3);
	const store = new Map();
	const serialize = data => {
		t.pass();
		return JSON.stringify(data);
	};

	const deserialize = data => {
		t.pass();
		return JSON.parse(data);
	};

	const keyv = new Keyv({store, serialize, deserialize});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test.serial('Keyv supports async serializer/deserializer', async t => {
	t.plan(3);
	const store = new Map();

	const serialize = async data => {
		t.pass();
		return JSON.stringify(data);
	};

	const deserialize = async data => {
		t.pass();
		return JSON.parse(data);
	};

	const keyv = new Keyv({store, serialize, deserialize});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test.serial('Keyv should wait for the expired get', async t => {
	const _store = new Map();
	const store = {
		get: key => _store.get(key),
		set(key, value) {
			_store.set(key, value);
		},
		async delete(key) {
			await new Promise(resolve => {
				setTimeout(() => {
					// Simulate database latency
					resolve();
				}, 20);
			});
			_store.delete(key);
		},
	};

	const keyv = new Keyv({store});

	// Round 1
	const v1 = await keyv.get('foo');
	t.is(v1, undefined);

	await keyv.set('foo', 'bar', 1000);
	const v2 = await keyv.get('foo');
	t.is(v2, 'bar');

	await new Promise(resolve => {
		setTimeout(() => {
			// Wait for expired
			resolve();
		}, 1100);
	});

	// Round 2
	const v3 = await keyv.get('foo');
	t.is(v3, undefined);

	await keyv.set('foo', 'bar', 1000);
	await new Promise(resolve => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const v4 = await keyv.get('foo');
	t.is(v4, 'bar');
});

test.serial('Keyv has should return if adapter does not support has', async t => {
	const keyv = new Keyv({store: store()});
	keyv.opts.store.has = undefined;
	await keyv.set('foo', 'bar');
	t.is(await keyv.has('foo'), true);
	t.is(await keyv.has('fizz'), false);
});

test.serial('.delete([keys]) should delete multiple key for storage adapter not supporting deleteMany', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	t.is(await keyv.delete(['foo', 'foo1', 'foo2']), true);
	t.is(await keyv.get('foo'), undefined);
	t.is(await keyv.get('foo1'), undefined);
	t.is(await keyv.get('foo2'), undefined);
});

test.serial('.delete([keys]) with nonexistent keys resolves to false for storage adapter not supporting deleteMany', async t => {
	const keyv = new Keyv({store: new Map()});
	t.is(await keyv.delete(['foo', 'foo1', 'foo2']), false);
});

test.serial('keyv.get([keys]) should return array values', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], 'bar');
	t.is(values[1], 'bar1');
	t.is(values[2], 'bar2');

	const rawValues = await keyv.get(['foo', 'foo1', 'foo2'], {raw: true});
	t.is(Array.isArray(rawValues), true);
	t.deepEqual(rawValues[0], {value: 'bar', expires: null});
	t.deepEqual(rawValues[1], {value: 'bar1', expires: null});
	t.deepEqual(rawValues[2], {value: 'bar2', expires: null});
});

test.serial('keyv.get([keys]) should return array value undefined when expires', async t => {
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

test.serial('keyv.get([keys]) should return array value undefined when expires sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
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

test.serial('keyv.get([keys]) should return empty array when expires sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	await keyv.set('foo', 'bar', 1);
	await keyv.set('foo1', 'bar1', 1);
	await keyv.set('foo2', 'bar2', 1);
	await new Promise(resolve => {
		setTimeout(() => {
			// Simulate database latency
			resolve();
		}, 30);
	});
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values.length, 3);
});

test.serial('keyv.get([keys]) should return array raw values sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	await keyv.set('foo', 'bar');
	await keyv.set('foo1', 'bar1');
	const values = await keyv.get(['foo', 'foo1'], {raw: true});
	t.is(Array.isArray(values), true);
	t.deepEqual(values[0], {value: 'bar', expires: null});
	t.deepEqual(values[1], {value: 'bar1', expires: null});
});

test.serial('keyv.get([keys]) should return array raw values undefined sqlite', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	const values = await keyv.get(['foo', 'foo1'], {raw: true});
	t.is(Array.isArray(values), true);
	t.is(values[0], undefined);
	t.is(values[1], undefined);
});

test.serial('keyv.get([keys]) should return array values with undefined', async t => {
	const keyv = new Keyv({store: new Map()});
	await keyv.set('foo', 'bar');
	await keyv.set('foo2', 'bar2');
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], 'bar');
	t.is(values[1], undefined);
	t.is(values[2], 'bar2');
});

test.serial('keyv.get([keys]) should return array values with all undefined using storage adapter', async t => {
	const keyv = new Keyv({store: store()});
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.is(values[0], undefined);
	t.is(values[1], undefined);
	t.is(values[2], undefined);
});

test.serial('keyv.get([keys]) should return undefined array for all no existent keys', async t => {
	const keyv = new Keyv({store: new Map()});
	const values = await keyv.get(['foo', 'foo1', 'foo2']);
	t.is(Array.isArray(values), true);
	t.deepEqual(values, [undefined, undefined, undefined]);
});

test('pass compress options', async t => {
	const keyv = new Keyv({store: new Map(), compression: new KeyvBrotli()});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test('compress/decompress with gzip', async t => {
	const keyv = new Keyv({store: new Map(), compression: new KeyvGzip()});
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test('iterator should exists with url', t => {
	const store = new Keyv({store: new KeyvMongo({url: 'mongodb://127.0.0.1:27017'})});
	t.is(typeof store.iterator, 'function');
});

test.serial(
	'keyv iterator() doesn\'t yield values from other namespaces with compression',
	async t => {
		const KeyvStore = new Map();

		const keyv1 = new Keyv({store: KeyvStore, namespace: 'keyv1', compression: new KeyvGzip()});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, namespace: 'keyv2', compression: new KeyvGzip()});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 11)]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.plan(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.true(doesKeyExist && isValueSame);
		}
	},
);

test.serial(
	'keyv iterator() doesn\'t yield values from other namespaces',
	async t => {
		const KeyvStore = new Map();

		const keyv1 = new Keyv({store: KeyvStore, namespace: 'keyv1'});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, namespace: 'keyv2'});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.plan(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.true(doesKeyExist && isValueSame);
		}
	},
);

test.serial(
	'keyv iterator() doesn\'t yield values from other namespaces with custom serializer/deserializer',
	async t => {
		const KeyvStore = new Map();

		const serialize = data => JSON.stringify(data);

		const deserialize = data => JSON.parse(data);

		const keyv1 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv1'});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv2'});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.plan(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.true(doesKeyExist && isValueSame);
		}
	},
);

test.serial(
	'keyv iterator() doesn\'t yield values from other namespaces with custom serializer/deserializer and compression',
	async t => {
		const KeyvStore = new Map();

		const serialize = data => JSON.stringify(data);

		const deserialize = data => JSON.parse(data);

		const keyv1 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv1', compression: new KeyvGzip()});
		const map1 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), String(i + 10)]),
		);
		const toResolve = [];
		for (const [key, value] of map1) {
			toResolve.push(keyv1.set(key, value));
		}

		await Promise.all(toResolve);

		const keyv2 = new Keyv({store: KeyvStore, serialize, deserialize, namespace: 'keyv2'});
		const map2 = new Map(
			Array.from({length: 5})
				.fill(0)
				.map((x, i) => [String(i), i + 11]),
		);
		toResolve.length = 0;
		for (const [key, value] of map2) {
			toResolve.push(keyv2.set(key, value));
		}

		await Promise.all(toResolve);

		t.plan(map2.size);
		for await (const [key, value] of keyv2.iterator()) {
			const doesKeyExist = map2.has(key);
			const isValueSame = map2.get(key) === value;
			t.true(doesKeyExist && isValueSame);
		}
	},
);

test.serial('close connection successfully', async t => {
	const keyv = new Keyv({store: store()});
	await keyv.clear();
	t.is(await keyv.get('foo'), undefined);
	keyv.set('foo', 'bar');
	t.is(await keyv.disconnect(), undefined);
});

test.serial('close connection undefined', async t => {
	const store = new Map();
	const keyv = new Keyv({store});
	t.is(await keyv.disconnect(), undefined);
});

test.serial('get keys, one key expired', async t => {
	const keyv = new Keyv({store: keyvMemcache});
	await keyv.set('foo', 'bar', 10_000);
	await keyv.set('fizz', 'buzz', 100);
	await keyv.set('ping', 'pong', 10_000);
	await new Promise(r => {
		setTimeout(r, 100);
	});
	await keyv.get(['foo', 'fizz', 'ping']);
	t.is(await keyv.get('fizz'), undefined);
	t.is(await keyv.get('foo'), 'bar');
	t.is(await keyv.get('ping'), 'pong');
});
